"use strict";

const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

let db = null;

function openSync(userDataPath) {
  if (db) return db;
  const dir = userDataPath;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  db = new sqlite3.Database(path.join(dir, "vault.db"));
  db.serialize(() => {
    db.run("PRAGMA foreign_keys = ON");
    db.run(`
      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        kdf_salt TEXT NOT NULL,
        verifier_iv TEXT NOT NULL,
        verifier_tag TEXT NOT NULL,
        verifier_data TEXT NOT NULL,
        api_token TEXT
      )
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT COLLATE NOCASE NOT NULL UNIQUE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      )
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS credentials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_id INTEGER NOT NULL,
        enc_iv TEXT NOT NULL,
        enc_tag TEXT NOT NULL,
        enc_data TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT
      )
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS note_folders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT COLLATE NOCASE NOT NULL UNIQUE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      )
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS vault_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        folder_id INTEGER NOT NULL,
        enc_iv TEXT NOT NULL,
        enc_tag TEXT NOT NULL,
        enc_data TEXT NOT NULL,
        color INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (folder_id) REFERENCES note_folders(id) ON DELETE RESTRICT
      )
    `);
  });
  return db;
}

function getDb() {
  if (!db) throw new Error("database not initialized");
  return db;
}

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().run(sql, params, function cb(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

async function tableExists(name) {
  const row = await dbGet(
    `SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1`,
    [name]
  );
  return !!row;
}

async function hasColumn(tbl, col) {
  const cols = await dbAll(`PRAGMA table_info(${tbl})`);
  return cols.some((c) => c.name === col);
}

async function ensureGeneralCategory() {
  let row = await dbGet(
    `SELECT id FROM categories WHERE name = 'General' COLLATE NOCASE`
  );
  if (row) return row.id;
  const ins = await dbRun(
    `INSERT INTO categories (name, sort_order, created_at) VALUES ('General', 0, ?)`,
    [Date.now()]
  );
  return ins.lastID;
}

async function rebuildCredentialsFlat() {
  await dbRun("DROP TABLE IF EXISTS credentials_flat");
  await dbRun("CREATE TABLE credentials_flat (\n\
      id INTEGER PRIMARY KEY AUTOINCREMENT,\n\
      category_id INTEGER NOT NULL,\n\
      enc_iv TEXT NOT NULL,\n\
      enc_tag TEXT NOT NULL,\n\
      enc_data TEXT NOT NULL,\n\
      created_at INTEGER NOT NULL,\n\
      updated_at INTEGER NOT NULL,\n\
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT\n\
    )");
  await dbRun(
    `INSERT INTO credentials_flat (id, category_id, enc_iv, enc_tag, enc_data, created_at, updated_at)
     SELECT id, category_id, enc_iv, enc_tag, enc_data, created_at, updated_at FROM credentials`
  );
  await dbRun("DROP TABLE credentials");
  await dbRun("ALTER TABLE credentials_flat RENAME TO credentials");
}

/**
 * Merge multi-vault `vaults` + `credentials(vault_id)` into single settings + categories.
 */
async function migrateFromVaultsTable() {
  const v = await dbGet(`SELECT * FROM vaults ORDER BY id ASC LIMIT 1`);
  if (!v) {
    await dbRun("DROP TABLE IF EXISTS vaults");
    return;
  }
  await dbRun(
    `INSERT OR REPLACE INTO settings (id, kdf_salt, verifier_iv, verifier_tag, verifier_data, api_token)
     VALUES (1, ?, ?, ?, ?, ?)`,
    [v.kdf_salt, v.verifier_iv, v.verifier_tag, v.verifier_data, v.api_token]
  );
  const minVid = v.id;
  await dbRun("PRAGMA foreign_keys = OFF");
  const gid = await ensureGeneralCategory();
  if (!(await hasColumn("credentials", "category_id"))) {
    await dbRun(`ALTER TABLE credentials ADD COLUMN category_id INTEGER`);
  }
  if (await hasColumn("credentials", "vault_id")) {
    await dbRun(`DELETE FROM credentials WHERE vault_id != ?`, [minVid]);
  }
  await dbRun(`UPDATE credentials SET category_id = ? WHERE category_id IS NULL`, [
    gid,
  ]);
  await rebuildCredentialsFlat();
  await dbRun("DROP TABLE IF EXISTS vaults");
  await dbRun("PRAGMA foreign_keys = ON");
}

async function migrateFromLegacyCredentialsNoCategory() {
  const hasCred = await tableExists("credentials");
  const hasVid = await hasColumn("credentials", "vault_id");
  const hasCat = await hasColumn("credentials", "category_id");
  const hasSets = await tableExists("settings");
  if (!hasCred || hasCat || hasVid || !hasSets) return;
  await ensureGeneralCategory();
  const gid = (
    await dbGet(`SELECT id FROM categories WHERE name = 'General' COLLATE NOCASE`)
  ).id;
  if (!(await hasColumn("credentials", "category_id"))) {
    await dbRun(`ALTER TABLE credentials ADD COLUMN category_id INTEGER`);
  }
  await dbRun(`UPDATE credentials SET category_id = ? WHERE category_id IS NULL`, [gid]);
  await rebuildCredentialsFlat();
}

async function runMigrations() {
  if (await tableExists("vaults")) {
    await migrateFromVaultsTable();
    return;
  }
  await migrateFromLegacyCredentialsNoCategory();
}

async function openDatabase(userDataPath) {
  openSync(userDataPath);
  await runMigrations();
}

module.exports = {
  openDatabase,
  openSync,
  getDb,
  dbRun,
  dbGet,
  dbAll,
};
