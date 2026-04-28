"use strict";

const nodeCrypto = require("crypto");
const crypto = require("./crypto");
const { dbRun, dbGet, dbAll } = require("./db");
const session = require("./session");

function normalizeHostname(urlOrHost) {
  if (!urlOrHost || typeof urlOrHost !== "string") return "";
  try {
    if (urlOrHost.includes("://")) return new URL(urlOrHost).hostname.toLowerCase();
  } catch {
    /* noop */
  }
  return urlOrHost.replace(/^https?:\/\//i, "").split("/")[0].toLowerCase();
}

function domainMatches(stored, current) {
  const a = normalizeHostname(stored);
  const b = normalizeHostname(current);
  if (!a || !b) return false;
  if (a === b) return true;
  return b.endsWith("." + a) || a.endsWith("." + b);
}

function normalizeName(raw, maxLen) {
  const s = String(raw || "").trim();
  return s.slice(0, maxLen || 128);
}

async function ensureGeneralCategory() {
  let row = await dbGet(
    `SELECT id FROM categories WHERE name = 'General' COLLATE NOCASE LIMIT 1`
  );
  if (row) return row.id;
  const ins = await dbRun(
    `INSERT INTO categories (name, sort_order, created_at) VALUES ('General', 0, ?)`,
    [Date.now()]
  );
  return ins.lastID;
}

async function ensureInboxNoteFolder() {
  let row = await dbGet(
    `SELECT id FROM note_folders WHERE name = 'Inbox' COLLATE NOCASE LIMIT 1`
  );
  if (row) return row.id;
  const ins = await dbRun(
    `INSERT INTO note_folders (name, sort_order, created_at) VALUES ('Inbox', 0, ?)`,
    [Date.now()]
  );
  return ins.lastID;
}

async function generalCategoryId() {
  const id = (
    await dbGet(`SELECT id FROM categories WHERE name = 'General' COLLATE NOCASE LIMIT 1`)
  )?.id;
  if (!id) return ensureGeneralCategory();
  return id;
}

async function hasVault() {
  const row = await dbGet(`SELECT id FROM settings WHERE id = 1`);
  return !!row;
}

async function createVault(masterPassword) {
  if (await hasVault()) {
    throw new Error("Vault already exists");
  }
  await ensureGeneralCategory();
  await ensureInboxNoteFolder();
  const salt = crypto.randomSalt(32);
  const key = await crypto.deriveMasterKey(masterPassword, salt);
  const verifier = await crypto.encryptVerifier(key);
  const apiToken = nodeCrypto.randomBytes(32).toString("hex");
  await dbRun(
    `INSERT INTO settings (id, kdf_salt, verifier_iv, verifier_tag, verifier_data, api_token)
     VALUES (1, ?, ?, ?, ?, ?)`,
    [salt.toString("hex"), verifier.iv, verifier.tag, verifier.data, apiToken]
  );
  crypto.wipeBuffer(salt);
  session.unlock(key);
  session.setExtensionToken(apiToken);
  session.setCachedEntries([]);
  session.setCachedNotes([]);
  return { ok: true };
}

function deriveDisplayTitle(url, plainTitle) {
  const t = typeof plainTitle === "string" ? plainTitle.trim() : "";
  if (t) return t.slice(0, 160);
  if (!url || typeof url !== "string") return "Login";
  try {
    const href = url.includes("://") ? url : `https://${url}`;
    const h = new URL(href).hostname.replace(/^www\./i, "");
    return h || "Login";
  } catch {
    return "Login";
  }
}

async function unlockVault(masterPassword) {
  const row = await dbGet(
    `SELECT kdf_salt, verifier_iv, verifier_tag, verifier_data, api_token FROM settings WHERE id = 1`
  );
  if (!row) {
    throw new Error("No vault found");
  }
  const salt = Buffer.from(row.kdf_salt, "hex");
  const key = await crypto.deriveMasterKey(masterPassword, salt);
  crypto.wipeBuffer(salt);
  const verifierPayload = {
    iv: row.verifier_iv,
    tag: row.verifier_tag,
    data: row.verifier_data,
  };
  if (!crypto.verifyDecrypt(verifierPayload, key)) {
    crypto.wipeBuffer(key);
    throw new Error("Invalid master password");
  }
  let apiToken = row.api_token;
  if (!apiToken) {
    apiToken = nodeCrypto.randomBytes(32).toString("hex");
    await dbRun(`UPDATE settings SET api_token = ? WHERE id = 1`, [apiToken]);
  }
  await ensureGeneralCategory();
  await ensureInboxNoteFolder();
  const creRows = await dbAll(`
    SELECT cr.id, cr.category_id,
           cr.enc_iv, cr.enc_tag, cr.enc_data, cr.created_at, cr.updated_at,
           cat.name AS category_name
    FROM credentials cr
    JOIN categories cat ON cat.id = cr.category_id
    ORDER BY cr.updated_at DESC
  `);
  const entries = [];
  for (const r of creRows) {
    const payload = { iv: r.enc_iv, tag: r.enc_tag, data: r.enc_data };
    try {
      const plain = crypto.decryptJson(payload, key);
      const urlStr = plain.url || "";
      const rawTitle = typeof plain.title === "string" ? plain.title.slice(0, 160) : "";
      entries.push({
        id: r.id,
        categoryId: r.category_id,
        categoryName: r.category_name,
        title: deriveDisplayTitle(urlStr, rawTitle),
        titleRaw: rawTitle,
        notes: typeof plain.notes === "string" ? plain.notes.slice(0, 8000) : "",
        url: urlStr,
        username: plain.username || "",
        password: plain.password || "",
        favorite: !!plain.favorite,
        lastUsed: plain.lastUsed || null,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      });
    } catch {
      /* skip corrupted */
    }
  }
  const noteRows = await dbAll(`
    SELECT n.id, n.folder_id, n.enc_iv, n.enc_tag, n.enc_data, n.color, n.created_at, n.updated_at,
           f.name AS folder_name
    FROM vault_notes n
    JOIN note_folders f ON f.id = n.folder_id
    ORDER BY n.updated_at DESC
  `);
  const notes = [];
  for (const r of noteRows) {
    const payload = { iv: r.enc_iv, tag: r.enc_tag, data: r.enc_data };
    try {
      const plain = crypto.decryptJson(payload, key);
      const titleRaw = typeof plain.title === "string" ? plain.title.slice(0, 160) : "";
      notes.push({
        id: r.id,
        folderId: r.folder_id,
        folderName: r.folder_name,
        title: titleRaw.trim() ? titleRaw : "Note",
        body: typeof plain.body === "string" ? plain.body.slice(0, 32000) : "",
        favorite: !!(plain && plain.favorite),
        color: Math.min(3, Math.max(0, Number(r.color) || 0)),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      });
    } catch {
      /* skip corrupted */
    }
  }
  session.unlock(key);
  session.setExtensionToken(apiToken);
  session.setCachedEntries(entries);
  session.setCachedNotes(notes);
  return { ok: true, count: entries.length };
}

function lockVault() {
  session.lock();
}

async function listCategories() {
  const rows = await dbAll(`
    SELECT id, name FROM categories ORDER BY sort_order ASC, name COLLATE NOCASE ASC
  `);
  return rows.map((r) => ({ id: r.id, name: r.name }));
}

async function addCategory(rawName) {
  const name = normalizeName(rawName);
  if (name.length < 1) throw new Error("Enter a category name");
  try {
    const ins = await dbRun(
      `INSERT INTO categories (name, sort_order, created_at) VALUES (?,?,?)`,
      [name, 0, Date.now()]
    );
    return { id: ins.lastID, name };
  } catch {
    throw new Error("That category name is already taken");
  }
}

async function deleteCategory(categoryId) {
  const gid = await generalCategoryId();
  if (Number(categoryId) === Number(gid)) {
    throw new Error("Cannot remove the General category");
  }
  const row = await dbGet(`SELECT name FROM categories WHERE id = ?`, [categoryId]);
  if (!row) throw new Error("Category not found");
  await dbRun(`UPDATE credentials SET category_id = ? WHERE category_id = ?`, [
    gid,
    categoryId,
  ]);
  await dbRun(`DELETE FROM categories WHERE id = ?`, [categoryId]);
  if (session.isUnlocked()) {
    for (const e of session.getCachedEntries()) {
      if (Number(e.categoryId) === Number(categoryId)) {
        e.categoryId = gid;
        e.categoryName = "General";
      }
    }
  }
}

async function listCredentials() {
  if (!session.isUnlocked()) {
    throw new Error("Vault is locked");
  }
  return session.getCachedEntries();
}

async function addCredential(payload) {
  const key = session.getDerivedKey();
  if (!key) throw new Error("Vault is locked");
  let cid =
    payload.categoryId != null
      ? Number(payload.categoryId)
      : await generalCategoryId();
  let catRow = await dbGet(`SELECT id, name FROM categories WHERE id = ?`, [cid]);
  if (!catRow) {
    cid = await generalCategoryId();
    catRow = await dbGet(`SELECT id, name FROM categories WHERE id = ?`, [cid]);
  }

  const now = Date.now();
  const plain = {
    title: typeof payload.title === "string" ? payload.title.slice(0, 160) : "",
    notes: typeof payload.notes === "string" ? payload.notes.slice(0, 8000) : "",
    url: payload.url || "",
    username: payload.username || "",
    password: payload.password || "",
    favorite: !!payload.favorite,
    lastUsed: null,
  };
  const enc = crypto.encryptJson(plain, key);
  const res = await dbRun(
    `INSERT INTO credentials (category_id, enc_iv, enc_tag, enc_data, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [cid, enc.iv, enc.tag, enc.data, now, now]
  );

  session.getCachedEntries().push({
    id: res.lastID,
    categoryId: cid,
    categoryName: catRow?.name || "",
    ...plain,
    title: deriveDisplayTitle(plain.url, plain.title),
    titleRaw: plain.title,
    createdAt: now,
    updatedAt: now,
  });
  return { id: res.lastID };
}

async function updateCredential(id, partial) {
  const key = session.getDerivedKey();
  if (!key) throw new Error("Vault is locked");

  const entries = session.getCachedEntries();
  const idx = entries.findIndex((e) => e.id === id);
  if (idx === -1) throw new Error("Entry not found");

  const prev = entries[idx];

  let nextCatId = prev.categoryId;
  let nextCatName = prev.categoryName;
  if (partial.categoryId != null && Number(partial.categoryId) !== Number(prev.categoryId)) {
    const nrow = await dbGet(`SELECT id, name FROM categories WHERE id = ?`, [
      partial.categoryId,
    ]);
    if (!nrow) throw new Error("Invalid category");
    nextCatId = nrow.id;
    nextCatName = nrow.name;
  }

  const nextUrl = partial.url !== undefined ? partial.url : prev.url;
  const titleRawNext =
    partial.title !== undefined
      ? String(partial.title).slice(0, 160)
      : prev.titleRaw != null && prev.titleRaw !== undefined
        ? String(prev.titleRaw)
        : "";
  const notesNext =
    partial.notes !== undefined
      ? String(partial.notes).slice(0, 8000)
      : prev.notes != null
        ? String(prev.notes)
        : "";

  const plain = {
    title: titleRawNext,
    notes: notesNext,
    url: nextUrl,
    username: partial.username !== undefined ? partial.username : prev.username,
    password: partial.password !== undefined ? partial.password : prev.password,
    favorite: partial.favorite !== undefined ? !!partial.favorite : !!prev.favorite,
    lastUsed: partial.lastUsed !== undefined ? partial.lastUsed : prev.lastUsed,
  };

  const enc = crypto.encryptJson(plain, key);
  const now = Date.now();

  await dbRun(
    `UPDATE credentials SET category_id = ?, enc_iv = ?, enc_tag = ?, enc_data = ?, updated_at = ?
     WHERE id = ?`,
    [nextCatId, enc.iv, enc.tag, enc.data, now, id]
  );

  entries[idx] = {
    id,
    categoryId: nextCatId,
    categoryName: nextCatName,
    ...plain,
    title: deriveDisplayTitle(nextUrl, titleRawNext),
    titleRaw: titleRawNext,
    createdAt: prev.createdAt,
    updatedAt: now,
  };
  return { ok: true };
}

async function deleteCredential(id) {
  const entries = session.getCachedEntries();
  const idx = entries.findIndex((e) => e.id === id);
  if (idx === -1) throw new Error("Entry not found");
  await dbRun(`DELETE FROM credentials WHERE id = ?`, [id]);
  entries.splice(idx, 1);
  return { ok: true };
}

function findForHostname(hostname) {
  const entries = session.getCachedEntries();
  const h = normalizeHostname(hostname);
  return entries.filter((e) => domainMatches(e.url, h));
}

async function regenerateExtensionToken() {
  if (!session.isUnlocked()) throw new Error("Vault is locked");
  const apiToken = nodeCrypto.randomBytes(32).toString("hex");
  await dbRun(`UPDATE settings SET api_token = ? WHERE id = 1`, [apiToken]);
  session.setExtensionToken(apiToken);
  return apiToken;
}

function getExtensionToken() {
  return session.getExtensionToken();
}

async function listNoteFolders() {
  if (!session.isUnlocked()) throw new Error("Vault is locked");
  const rows = await dbAll(
    `SELECT id, name FROM note_folders ORDER BY sort_order ASC, name COLLATE NOCASE ASC`
  );
  return rows.map((r) => ({ id: r.id, name: r.name }));
}

async function addNoteFolder(rawName) {
  if (!session.isUnlocked()) throw new Error("Vault is locked");
  const name = normalizeName(rawName);
  if (name.length < 1) throw new Error("Enter a folder name");
  try {
    const ins = await dbRun(
      `INSERT INTO note_folders (name, sort_order, created_at) VALUES (?,?,?)`,
      [name, 0, Date.now()]
    );
    return { id: ins.lastID, name };
  } catch {
    throw new Error("That folder name is already taken");
  }
}

async function deleteNoteFolder(folderId) {
  if (!session.isUnlocked()) throw new Error("Vault is locked");
  const inboxId = await ensureInboxNoteFolder();
  if (Number(folderId) === Number(inboxId)) {
    throw new Error("Cannot remove the Inbox folder");
  }
  const row = await dbGet(`SELECT name FROM note_folders WHERE id = ?`, [folderId]);
  if (!row) throw new Error("Folder not found");
  await dbRun(`UPDATE vault_notes SET folder_id = ? WHERE folder_id = ?`, [inboxId, folderId]);
  await dbRun(`DELETE FROM note_folders WHERE id = ?`, [folderId]);
  for (const n of session.getCachedNotes()) {
    if (Number(n.folderId) === Number(folderId)) {
      n.folderId = inboxId;
      n.folderName = "Inbox";
    }
  }
  return { ok: true };
}

function listVaultNotes() {
  if (!session.isUnlocked()) throw new Error("Vault is locked");
  return [...session.getCachedNotes()].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

async function addVaultNote(payload) {
  const key = session.getDerivedKey();
  if (!key) throw new Error("Vault is locked");
  let fid =
    payload.folderId != null ? Number(payload.folderId) : await ensureInboxNoteFolder();
  let frow = await dbGet(`SELECT id, name FROM note_folders WHERE id = ?`, [fid]);
  if (!frow) {
    fid = await ensureInboxNoteFolder();
    frow = await dbGet(`SELECT id, name FROM note_folders WHERE id = ?`, [fid]);
  }
  const now = Date.now();
  const plain = {
    title: typeof payload.title === "string" ? payload.title.slice(0, 160) : "",
    body: typeof payload.body === "string" ? payload.body.slice(0, 32000) : "",
    favorite: !!(payload && payload.favorite),
  };
  const color = Math.min(3, Math.max(0, Number(payload.color) ?? 0));
  const enc = crypto.encryptJson(plain, key);
  const res = await dbRun(
    `INSERT INTO vault_notes (folder_id, enc_iv, enc_tag, enc_data, color, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?)`,
    [fid, enc.iv, enc.tag, enc.data, color, now, now]
  );
  const titleDisp = plain.title.trim() ? plain.title.trim() : "Untitled";
  const entry = {
    id: res.lastID,
    folderId: fid,
    folderName: frow?.name || "Inbox",
    title: titleDisp,
    body: plain.body,
    favorite: !!plain.favorite,
    color,
    createdAt: now,
    updatedAt: now,
  };
  session.getCachedNotes().push(entry);
  return { id: res.lastID, updatedAt: now };
}

async function updateVaultNote(id, partial) {
  const key = session.getDerivedKey();
  if (!key) throw new Error("Vault is locked");
  const notes = session.getCachedNotes();
  const idx = notes.findIndex((e) => e.id === id);
  if (idx === -1) throw new Error("Note not found");
  const prev = notes[idx];
  let nextFolderId = prev.folderId;
  let nextFolderName = prev.folderName;
  if (partial.folderId != null && Number(partial.folderId) !== Number(prev.folderId)) {
    const nrow = await dbGet(`SELECT id, name FROM note_folders WHERE id = ?`, [
      partial.folderId,
    ]);
    if (!nrow) throw new Error("Invalid folder");
    nextFolderId = nrow.id;
    nextFolderName = nrow.name;
  }
  const titleNext =
    partial.title !== undefined ? String(partial.title).slice(0, 160) : prev.title || "";
  const bodyNext =
    partial.body !== undefined ? String(partial.body).slice(0, 32000) : prev.body || "";
  const colorNext =
    partial.color !== undefined
      ? Math.min(3, Math.max(0, Number(partial.color) || 0))
      : prev.color;
  const favPrev = !!prev.favorite;
  const favNext =
    partial.favorite !== undefined ? !!partial.favorite : favPrev;
  const plain = { title: titleNext, body: bodyNext, favorite: favNext };
  const enc = crypto.encryptJson(plain, key);
  const now = Date.now();
  await dbRun(
    `UPDATE vault_notes SET folder_id = ?, enc_iv = ?, enc_tag = ?, enc_data = ?, color = ?, updated_at = ?
     WHERE id = ?`,
    [nextFolderId, enc.iv, enc.tag, enc.data, colorNext, now, id]
  );
  const titleDisp = titleNext.trim() ? titleNext.trim() : "Untitled";
  notes[idx] = {
    id,
    folderId: nextFolderId,
    folderName: nextFolderName,
    title: titleDisp,
    body: bodyNext,
    favorite: favNext,
    color: colorNext,
    createdAt: prev.createdAt,
    updatedAt: now,
  };
  return { ok: true, id, updatedAt: now };
}

async function deleteVaultNote(id) {
  const notes = session.getCachedNotes();
  const idx = notes.findIndex((e) => e.id === id);
  if (idx === -1) throw new Error("Note not found");
  await dbRun(`DELETE FROM vault_notes WHERE id = ?`, [id]);
  notes.splice(idx, 1);
  return { ok: true, id };
}

module.exports = {
  normalizeHostname,
  domainMatches,
  hasVault,
  createVault,
  unlockVault,
  lockVault,
  listCategories,
  addCategory,
  deleteCategory,
  listCredentials,
  addCredential,
  updateCredential,
  deleteCredential,
  findForHostname,
  regenerateExtensionToken,
  getExtensionToken,
  listNoteFolders,
  addNoteFolder,
  deleteNoteFolder,
  listVaultNotes,
  addVaultNote,
  updateVaultNote,
  deleteVaultNote,
};
