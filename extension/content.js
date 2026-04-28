"use strict";

async function apiFetchCredentials(hostname) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "MYVAULT_FETCH_CREDS", hostname }, (res) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, items: [], error: chrome.runtime.lastError.message });
        return;
      }
      resolve(res || { ok: false, items: [], error: "no_response" });
    });
  });
}

async function apiSaveCredential(payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "MYVAULT_SAVE_CRED", ...payload }, (res) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(res || { ok: false });
    });
  });
}

async function apiListCategories() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "MYVAULT_LIST_CATEGORIES" }, (res) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, categories: [], error: chrome.runtime.lastError.message });
        return;
      }
      resolve(res || { ok: false, categories: [], error: "no_response" });
    });
  });
}

/* ── Myvault overlays (shadow + slot — app-like glass styling) ─────────────── */
let __mv;

function vaultUiEnsure() {
  if (__mv) return __mv;
  let host = document.getElementById("__myvault_modal_root");
  if (!host) {
    host = document.createElement("div");
    host.id = "__myvault_modal_root";
    host.style.cssText =
      "all:initial;display:block;position:fixed;inset:0;z-index:2147483646;pointer-events:none;";
    document.documentElement.appendChild(host);
  }
  const shadow = host.attachShadow({ mode: "open" });
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap";
  shadow.appendChild(link);
  const css = document.createElement("style");
  css.textContent = `
    * { box-sizing: border-box; }
    /* Centered modal with dim backdrop (save flow only) */
    .mv-overlay { pointer-events:auto; font-family:Poppins,system-ui,sans-serif;
      position:fixed; inset:0; background:rgba(0,0,0,.32); display:flex;
      align-items:center; justify-content:center; padding:20px;
      backdrop-filter:saturate(1.06); animation: mvIn .2s ease; }
    /* Pick-account: dock top-right — no backdrop, page unaffected */
    .mv-dock { pointer-events:none; font-family:Poppins,system-ui,sans-serif;
      position:fixed; top:20px; right:20px; bottom:auto; left:auto;
      max-width:min(380px,calc(100vw - 24px)); max-height:calc(100vh - 40px);
      display:flex; flex-direction:column; align-items:stretch;
      z-index:1; animation: mvDock .22s ease; }
    .mv-dock .mv-card {
      pointer-events:auto;
      width:100%; max-width:100%; margin:0;
      box-shadow:0 12px 40px rgba(0,0,0,.14), 0 4px 12px rgba(0,0,0,.06),
        inset 0 1px 0 rgba(255,255,255,.85);}
    @keyframes mvIn { from { opacity:.6 } to { opacity:1 } }
    @keyframes mvDock { from { opacity:0; transform:translateY(-10px) } to { opacity:1; transform:translateY(0) } }
    .mv-toast-wrap { pointer-events:none; position:fixed; top:20px; right:20px; left:auto;
      z-index:2; font-family:Poppins,system-ui,sans-serif; max-width:min(400px,calc(100vw - 32px)); }
    .mv-toast { pointer-events:auto; padding:12px 16px;border-radius:14px; font-size:13px;line-height:1.45;
      background:rgba(28,28,30,.94);color:#fff;box-shadow:0 12px 32px rgba(0,0,0,.35);
      animation: mvDock .22s ease; border:1px solid rgba(255,255,255,.12); text-align:left; }
    .mv-banner-card { padding:16px 18px 14px; }
    .mv-brand-row { display:flex; align-items:center; gap:10px; margin-bottom:8px; }
    .mv-logo { width:32px;height:32px; flex-shrink:0; border-radius:8px;
      background:linear-gradient(145deg,#007aff,#5856d6); display:flex; align-items:center; justify-content:center; }
    .mv-logo svg { width:18px;height:18px; color:#fff; }
    .mv-banner-title { font-weight:700; font-size:16px; letter-spacing:-.02em; color:#1d1d1f; }
    .mv-banner-detail { font-size:12px; color:#6e6e73; line-height:1.45; margin-top:4px; word-break:break-word; }
    .mv-banner-foot { margin-top:12px; display:flex; justify-content:flex-end; }
    .mv-dock.mv-wide { max-width:min(420px,calc(100vw - 24px)); }
    .mv-card { pointer-events:auto; width:min(440px,calc(100vw - 32px));
      background:rgba(255,255,255,.93); backdrop-filter:blur(22px); border-radius:22px;
      padding:22px 22px 16px; border:1px solid rgba(0,0,0,.08);
      box-shadow:0 24px 80px rgba(0,0,0,.12), inset 0 1px 0 rgba(255,255,255,.85);
      color:#1d1d1f;
    }
    .mv-brand { font-weight:700;font-size:18px;letter-spacing:-.02em; }
    .mv-sub { margin-top:6px;font-size:12px;color:#6e6e73;line-height:1.35; }
    .mv-list { max-height:min(340px,calc(100vh - 200px)); overflow-y:auto; margin-top:14px; }
    .mv-row { width:100%; border:1px solid rgba(0,0,0,.07); border-radius:14px; padding:12px;
      margin-bottom:8px; cursor:pointer; text-align:left; background:#fff;
      transition:background .14s,border-color .14s;font:inherit; display:block;}
    .mv-row:hover { background:rgba(0,122,255,.07);border-color:rgba(0,122,255,.33); }
    .mv-u { font-weight:600;font-size:14px; }
    .mv-meta { margin-top:4px;font-size:11px;color:#6e6e73;line-height:1.3; word-break:break-all; }
    .mv-ft { margin-top:16px;display:flex;justify-content:flex-end;gap:10px;}
    button.mv-plain { cursor:pointer;background:transparent;color:#6e6e73;border:none;
      font:inherit;font-weight:600;font-size:13px;padding:10px 8px;border-radius:10px;}
    button.mv-blue { cursor:pointer;background:#007aff;color:#fff;border:none;border-radius:12px;
      font:inherit;font-weight:600;font-size:13px;padding:11px 18px;
      box-shadow:0 4px 14px rgba(0,122,255,.28);}
    button.mv-plain:hover{background:rgba(0,0,0,.04)}
    button.mv-blue:hover{background:#005ed9}
    .mv-label { margin-top:12px;display:block;font-size:11px;font-weight:600;text-transform:uppercase;
      letter-spacing:.04em;color:#6e6e73; }
    .mv-inp,.mv-sel { width:100%;margin-top:6px;padding:11px;border-radius:12px;
      border:1px solid rgba(0,0,0,.11);font:inherit;font-size:14px;background:#fff; }
    .mv-fields { margin-top:4px;}
  `;
  shadow.appendChild(css);
  const slot = document.createElement("div");
  shadow.appendChild(slot);
  __mv = {
    shadow,
    host,
    slot,
    /* Host stays non-interceptive; only portal children use pointer-events:auto */
    ensureHostPassThrough() {
      host.style.pointerEvents = "none";
    },
  };
  return __mv;
}

function vaultDismiss() {
  const u = vaultUiEnsure();
  u.slot.innerHTML = "";
  u.ensureHostPassThrough();
}

/** Close any Myvault dock, modal, toast, or banner so a new prompt can show cleanly. */
function dismissMvOverlays() {
  clearTimeout(mvToastTimer);
  mvToastTimer = null;
  vaultDismiss();
}

function vaultAttach(node) {
  const u = vaultUiEnsure();
  u.slot.innerHTML = "";
  u.slot.appendChild(node);
  u.ensureHostPassThrough();
}

let mvToastTimer;

/** Retries delayed autofill when React/framework swallows first fill (same page URL). */
const mvAutoRetriesByFp = new Map();

/** Small brand icon (SVG) for dock cards — matches desktop Myvault feel. */
function mvLogoSvg() {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  const p = document.createElementNS(ns, "path");
  p.setAttribute(
    "d",
    "M12 3l8 4v6c0 5-3.4 9.4-8 10-4.6-.6-8-5-8-10V7l8-4z"
  );
  p.setAttribute("stroke", "currentColor");
  p.setAttribute("stroke-width", "1.6");
  p.setAttribute("stroke-linejoin", "round");
  svg.appendChild(p);
  return svg;
}

/** Non-blocking toast (top-right). */
function showMvToast(message) {
  const u = vaultUiEnsure();
  const prevT = u.slot.querySelector(".mv-toast-wrap");
  if (prevT) prevT.remove();
  clearTimeout(mvToastTimer);
  const wrap = document.createElement("div");
  wrap.className = "mv-toast-wrap";
  const t = document.createElement("div");
  t.className = "mv-toast";
  t.textContent = message;
  wrap.appendChild(t);
  u.slot.appendChild(wrap);
  u.host.style.pointerEvents = "auto";
  clearTimeout(mvToastTimer);
  mvToastTimer = window.setTimeout(() => {
    wrap.remove();
    u.ensureHostPassThrough();
  }, 5200);
}

/**
 * Rich top-right notification (replaces window.alert for extension messages).
 * @param {{ title?: string, detail?: string, text?: string, tone?: 'default'|'warn' }} opts
 */
function showMvBanner(opts) {
  dismissMvOverlays();
  const title = String(opts.title || "Myvault");
  const detail = String(opts.detail || opts.text || "").trim();
  const u = vaultUiEnsure();
  const wrap = document.createElement("div");
  wrap.className = "mv-dock mv-wide";
  const card = document.createElement("div");
  card.className = "mv-card mv-banner-card";
  const row = document.createElement("div");
  row.className = "mv-brand-row";
  const lg = document.createElement("div");
  lg.className = "mv-logo";
  lg.appendChild(mvLogoSvg());
  const titles = document.createElement("div");
  const ht = document.createElement("div");
  ht.className = "mv-banner-title";
  ht.textContent = title;
  titles.appendChild(ht);
  row.appendChild(lg);
  row.appendChild(titles);
  card.appendChild(row);
  if (detail) {
    const d = document.createElement("div");
    d.className = "mv-banner-detail";
    d.textContent = detail;
    card.appendChild(d);
  }
  const ft = document.createElement("div");
  ft.className = "mv-banner-foot";
  const ok = document.createElement("button");
  ok.type = "button";
  ok.className = "mv-blue";
  ok.textContent = "OK";
  ok.addEventListener("click", () => {
    wrap.remove();
    u.ensureHostPassThrough();
  });
  ft.appendChild(ok);
  card.appendChild(ft);
  wrap.appendChild(card);
  const prev = u.slot.querySelector(".mv-dock.mv-banner-host");
  if (prev) prev.remove();
  wrap.classList.add("mv-banner-host");
  u.slot.appendChild(wrap);
  u.host.style.pointerEvents = "auto";
}

function showPickAccountOverlay(items) {
  return new Promise((resolve) => {
    dismissMvOverlays();
    const wrap = document.createElement("div");
    wrap.className = "mv-dock mv-wide";
    const card = document.createElement("div");
    card.className = "mv-card";
    const brandRow = document.createElement("div");
    brandRow.className = "mv-brand-row";
    const lg = document.createElement("div");
    lg.className = "mv-logo";
    lg.appendChild(mvLogoSvg());
    const hWrap = document.createElement("div");
    const h = document.createElement("div");
    h.className = "mv-banner-title";
    h.textContent = "Myvault";
    hWrap.appendChild(h);
    brandRow.appendChild(lg);
    brandRow.appendChild(hWrap);
    card.appendChild(brandRow);
    const s = document.createElement("div");
    s.className = "mv-sub";
    s.textContent = "Several logins match this site — tap one to fill username & password.";
    card.appendChild(s);
    const list = document.createElement("div");
    list.className = "mv-list";
    items.forEach((it) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "mv-row";
      const lu = document.createElement("div");
      lu.className = "mv-u";
      lu.textContent = String(it.username || "").trim() || "(no username)";
      b.appendChild(lu);
      const m = document.createElement("div");
      m.className = "mv-meta";
      const t = String(it.title || "").trim();
      const u = String(it.url || "").replace(/^https?:\/\//i, "").slice(0, 92);
      m.textContent = t ? `${t} · ${u}` : u || "—";
      b.appendChild(m);
      b.addEventListener("click", () => {
        vaultDismiss();
        resolve(it);
      });
      list.appendChild(b);
    });
    card.appendChild(list);
    const ft = document.createElement("div");
    ft.className = "mv-ft";
    const not = document.createElement("button");
    not.type = "button";
    not.className = "mv-plain";
    not.textContent = "Not now";
    not.addEventListener("click", () => {
      vaultDismiss();
      resolve(null);
    });
    ft.appendChild(not);
    card.appendChild(ft);
    wrap.appendChild(card);
    vaultAttach(wrap);
  });
}

async function fillFromCredential(passField, cred) {
  const formRoot = passField.form || document;
  let userField = findUsernameNear(document, formRoot, passField);
  if (userField && !(userField instanceof HTMLInputElement || userField instanceof HTMLTextAreaElement)) {
    userField = null;
  }
  if (userField) setNativeInputValue(userField, cred.username || "");
  const pw = cred.password || "";
  setNativeInputValue(passField, pw);

  async function verifyAndRetry() {
    await new Promise((r) => requestAnimationFrame(r));
    const got = String(passField.value || "").trim();
    const expect = String(pw || "").trim();
    if (!expect || got === expect) return;
    await new Promise((r) => setTimeout(r, 90));
    setNativeInputValue(passField, pw);
    await new Promise((r) => requestAnimationFrame(r));
    if (!String(passField.value || "").trim()) {
      try {
        passField.focus({ preventScroll: true });
      } catch (_) {
        //
      }
      passField.click();
      setNativeInputValue(passField, pw);
    }
  }
  await verifyAndRetry();
}

function showSaveLoginModal(hostnameLabel, hostnameForTitle, username, password) {
  return new Promise((resolve) => {
    dismissMvOverlays();
    function makeLabel(t) {
      const d = document.createElement("label");
      d.className = "mv-label";
      d.textContent = t;
      return d;
    }

    function makeReadRow(label, value) {
      const box = document.createElement("div");
      box.style.marginTop = "10px";
      const lb = document.createElement("div");
      lb.className = "mv-label";
      lb.style.marginTop = "0";
      lb.textContent = label;
      const val = document.createElement("div");
      val.style.fontSize = "13px";
      val.style.marginTop = "4px";
      val.style.wordBreak = "break-all";
      val.style.lineHeight = "1.35";
      val.style.color = value ? "#1d1d1f" : "#8e8e93";
      val.textContent = value || "—";
      box.appendChild(lb);
      box.appendChild(val);
      return box;
    }

    const pageUrl =
      typeof location !== "undefined" && location.href
        ? String(location.href).slice(0, 512)
        : "";

    const wrap = document.createElement("div");
    wrap.className = "mv-dock mv-wide";
    const card = document.createElement("div");
    card.className = "mv-card";

    const brandRow = document.createElement("div");
    brandRow.className = "mv-brand-row";
    const lg = document.createElement("div");
    lg.className = "mv-logo";
    lg.appendChild(mvLogoSvg());
    const titleCol = document.createElement("div");
    const t1 = document.createElement("div");
    t1.className = "mv-banner-title";
    t1.textContent = "Myvault";
    const t2 = document.createElement("div");
    t2.className = "mv-sub";
    t2.style.marginTop = "2px";
    t2.textContent = "Save this login?";
    titleCol.appendChild(t1);
    titleCol.appendChild(t2);
    brandRow.appendChild(lg);
    brandRow.appendChild(titleCol);
    card.appendChild(brandRow);

    const sub = document.createElement("div");
    sub.className = "mv-sub";
    sub.textContent = `We’ll store this in your vault for ${hostnameLabel || "this site"}.`;
    card.appendChild(sub);

    card.appendChild(makeReadRow("Page URL", pageUrl));
    card.appendChild(makeReadRow("Username", username));
    const pwRowWrap = document.createElement("div");
    pwRowWrap.style.marginTop = "10px";
    const pwLb = document.createElement("div");
    pwLb.className = "mv-label";
    pwLb.textContent = "Password";
    const pwLine = document.createElement("div");
    pwLine.style.display = "flex";
    pwLine.style.alignItems = "center";
    pwLine.style.gap = "8px";
    pwLine.style.marginTop = "4px";
    const pwShow = document.createElement("span");
    pwShow.style.fontSize = "13px";
    pwShow.style.fontFamily = "ui-monospace, monospace";
    pwShow.style.flex = "1";
    pwShow.style.minWidth = "0";
    pwShow.style.wordBreak = "break-all";
    let revealed = false;
    function paintPw() {
      const p = password || "";
      pwShow.textContent = revealed ? p : p ? "•".repeat(Math.min(32, p.length)) : "—";
      if (!p) pwShow.style.color = "#8e8e93";
      else pwShow.style.color = "#1d1d1f";
    }
    paintPw();
    const revealBtn = document.createElement("button");
    revealBtn.type = "button";
    revealBtn.className = "mv-plain";
    revealBtn.style.padding = "6px 8px";
    revealBtn.textContent = "Show";
    revealBtn.addEventListener("click", () => {
      revealed = !revealed;
      revealBtn.textContent = revealed ? "Hide" : "Show";
      paintPw();
    });
    pwLine.appendChild(pwShow);
    pwLine.appendChild(revealBtn);
    pwRowWrap.appendChild(pwLb);
    pwRowWrap.appendChild(pwLine);
    card.appendChild(pwRowWrap);

    card.appendChild(makeLabel("Display name"));
    const nameEl = document.createElement("input");
    nameEl.className = "mv-inp";
    nameEl.type = "text";
    nameEl.placeholder = "e.g. Webmail · Work";
    nameEl.value =
      hostnameForTitle.trim().replace(/^www\./i, "").split(".")[0]?.slice(0, 56) ||
      hostnameForTitle.trim();
    card.appendChild(nameEl);
    card.appendChild(makeLabel("Category"));
    const sel = document.createElement("select");
    sel.className = "mv-inp mv-sel";
    card.appendChild(sel);

    const ft = document.createElement("div");
    ft.className = "mv-ft";
    const declining = document.createElement("button");
    declining.type = "button";
    declining.className = "mv-plain";
    declining.textContent = "Not now";
    const saving = document.createElement("button");
    saving.type = "button";
    saving.className = "mv-blue";
    saving.textContent = "Save";
    ft.appendChild(declining);
    ft.appendChild(saving);
    card.appendChild(ft);
    wrap.appendChild(card);

    void (async () => {
      sel.innerHTML = "";
      const r = await apiListCategories();
      const rows = r.ok ? r.categories || [] : [];
      if (!rows.length) {
        const o = document.createElement("option");
        o.value = "";
        o.textContent = "(Categories unavailable)";
        sel.appendChild(o);
        sel.disabled = true;
        return;
      }
      rows.forEach((c) => {
        const o = document.createElement("option");
        o.value = String(c.id);
        o.textContent = c.name;
        sel.appendChild(o);
      });
      const pref =
        rows.find((x) => (x.name || "").toLowerCase() === "general") || rows[0];
      if (pref) sel.value = String(pref.id);
    })();

    declining.addEventListener("click", () => {
      vaultDismiss();
      resolve({ declined: true });
    });

    saving.addEventListener("click", async () => {
      const title = String(nameEl.value || "").slice(0, 160).trim();
      let categoryId =
        sel.value && !sel.disabled && sel.value.trim() !== "" ? Number(sel.value) : undefined;
      if (Number.isNaN(categoryId)) categoryId = undefined;
      vaultDismiss();
      resolve({
        declined: false,
        title,
        categoryId,
        username,
        password,
      });
    });

    vaultAttach(wrap);
    nameEl.focus();
  });
}

function visible(el) {
  if (!el || !(el instanceof HTMLElement)) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
}

/** Last focused password input — SPA login often has no real <form> / submit event. */
let mvLastPasswordField = null;

/**
 * Traverse light DOM + all open shadow roots (depth-first).
 * @param {ParentNode | null} root
 * @param {(el: Element) => void} visit
 */
function walkRootsDeep(root, visit) {
  if (!root) return;
  try {
    if (root.nodeType === Node.DOCUMENT_NODE) {
      if (root.documentElement) walkRootsDeep(root.documentElement, visit);
      return;
    }
    const start =
      root.nodeType === Node.DOCUMENT_FRAGMENT_NODE
        ? root
        : root.nodeType === Node.ELEMENT_NODE
          ? root
          : null;
    if (!start) return;
    /** @type {Element[]} */
    const stack = [];
    stack.push(start);
    while (stack.length) {
      const cur = stack.pop();
      if (!cur || cur.nodeType !== Node.ELEMENT_NODE) continue;
      visit(cur);
      const ch = cur.children;
      for (let i = ch.length - 1; i >= 0; i--) stack.push(ch[i]);
      const sh = cur.shadowRoot;
      if (sh) {
        for (let j = sh.children.length - 1; j >= 0; j--) stack.push(sh.children[j]);
      }
    }
  } catch (_) {
    //
  }
}

/** Read React / Vue-backed inputs reliably */
function getInputValue(el) {
  if (!el || !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return "";
  try {
    const Proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
    const desc = Object.getOwnPropertyDescriptor(Proto.prototype, "value");
    if (desc && desc.get) return String(desc.get.call(el) ?? "");
  } catch (_) {
    //
  }
  return String(el.value || "");
}

function gatherVisiblePasswordFieldsFrom(root) {
  /** @type {HTMLInputElement[]} */
  const out = [];
  if (!root) return out;
  const start =
    root instanceof Document
      ? root.documentElement
      : root instanceof HTMLElement || root instanceof DocumentFragment
        ? root
        : null;
  if (!start) return out;
  walkRootsDeep(start, (el) => {
    if (!(el instanceof HTMLInputElement)) return;
    if ((el.type || "").toLowerCase() !== "password") return;
    if (!visible(el)) return;
    out.push(el);
  });
  return out;
}

function gatherVisiblePasswordFields() {
  return gatherVisiblePasswordFieldsFrom(document);
}

/**
 * Prefer last-focused password box, then largest visible field (helps multi-step UIs).
 * @param {Document|HTMLElement|DocumentFragment|null} [scope=document]
 */
function resolveBestPasswordField(scope) {
  const doc = scope && scope.nodeType === Node.DOCUMENT_NODE ? scope : document;
  const all =
    !scope || scope === document || scope.nodeType === Node.DOCUMENT_NODE
      ? gatherVisiblePasswordFields()
      : gatherVisiblePasswordFieldsFrom(scope instanceof HTMLElement ? scope : doc.documentElement);
  if (!all.length) return null;
  try {
    if (doc?.activeElement instanceof HTMLInputElement && doc.activeElement.type === "password") {
      if (all.includes(doc.activeElement)) return doc.activeElement;
    }
  } catch (_) {
    //
  }
  if (mvLastPasswordField && document.contains(mvLastPasswordField) && all.includes(mvLastPasswordField))
    return mvLastPasswordField;
  return all.sort(
    (a, b) =>
      b.getBoundingClientRect().width * b.getBoundingClientRect().height -
      a.getBoundingClientRect().width * a.getBoundingClientRect().height
  )[0];
}

function scoreUsernameCandidate(inp) {
  if (!(inp instanceof HTMLInputElement || inp instanceof HTMLTextAreaElement)) return 0;
  const ty = (inp.type || "").toLowerCase();
  const ac = (inp.getAttribute("autocomplete") || "").toLowerCase();
  const nm = `${inp.name || ""} ${inp.id || ""}`.toLowerCase();
  const ph = (inp.getAttribute("placeholder") || "").toLowerCase();
  if (ac.includes("username") || ac.includes("email")) return 42;
  if (ty === "email") return 40;
  if (/mail|email|user|login|identifier|account|phone/i.test(nm)) return 32;
  if (/mail|email|sign in|your id/i.test(ph)) return 28;
  if (ph.includes("@")) return 24;
  if (inp instanceof HTMLInputElement && (ty === "text" || ty === "")) return 14;
  return ty === "search" ? 0 : 8;
}

/**
 * Finds username/email for a password field, including deep shadow DOM.
 */
function findUsernameForPasswordGlobally(passwordField, formHint) {
  let best = findUsernameNear(document, formHint instanceof HTMLFormElement ? formHint : document, passwordField);
  if (!best || !visible(best)) best = findUsernameNear(document, document, passwordField);
  if (best && visible(best) && scoreUsernameCandidate(best) >= 28) return best;

  /** @type {HTMLInputElement|HTMLTextAreaElement|null} */
  let top = null;
  let topScore = -1;
  walkRootsDeep(document, (el) => {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
    if (!visible(el)) return;
    if (el === passwordField) return;
    const ty = el instanceof HTMLInputElement ? el.type || "" : "textarea";
    if (ty === "password" || ty === "hidden" || ty === "submit" || ty === "button" || ty === "reset")
      return;
    const sc = scoreUsernameCandidate(el);
    if (sc > topScore && sc >= 8) {
      topScore = sc;
      top = el;
    }
  });
  return top || best || null;
}

function normalizeLoginButton(btn) {
  if (!(btn instanceof HTMLElement)) return { text: "", type: "", tag: "" };
  const raw = `${btn.textContent || btn.getAttribute?.("aria-label") || ""}`;
  const inp = btn instanceof HTMLInputElement ? btn : null;
  const text = (inp && inp.type === "submit" ? inp.value : raw || inp?.value || "").trim().toLowerCase();
  const type = (btn.getAttribute("type") || "").toLowerCase();
  const tag = (btn.tagName || "").toLowerCase();
  return { text, type, tag };
}

function looksLikeLoginButton(btn) {
  if (!(btn instanceof HTMLElement)) return false;
  const { text, type, tag } = normalizeLoginButton(btn);
  const textLooks =
    /sign\s*in|log\s*in|logon|sign\s*on|let'?s go|continue|next|verify|submit|sign\s*up|register|access|unlock|open\s*mailbox|enter|proceed|connect|authenticate/.test(
      text
    );
  if (textLooks) return true;
  if (!gatherVisiblePasswordFields().length) return false;
  return (
    type === "submit" ||
    (tag === "button" && (!type || type === "submit")) ||
    btn.getAttribute("role") === "button"
  );
}

/** Prefer form `submit` listener when this control will fire a native submit (avoids duplicate modals). */
function isLikelyNativeFormSubmitControl(btn) {
  if (!(btn instanceof HTMLElement)) return false;
  const form = btn.closest("form");
  if (!(form instanceof HTMLFormElement)) return false;
  if (btn instanceof HTMLInputElement && btn.type === "submit") return true;
  if (btn instanceof HTMLButtonElement) {
    const ty = (btn.getAttribute("type") || "").toLowerCase();
    return !ty || ty === "submit";
  }
  return false;
}

function querySelectorDeep(root, selector, maxDepth) {
  maxDepth = maxDepth ?? 9;
  if (!root || maxDepth < 0) return null;
  try {
    const hit = root.querySelector(selector);
    if (hit) return hit;
    for (const node of root.querySelectorAll("*")) {
      if (node.shadowRoot) {
        const n = querySelectorDeep(node.shadowRoot, selector, maxDepth - 1);
        if (n) return n;
      }
    }
  } catch (_) {
    /* ignore */
  }
  return null;
}

const PASSWORD_SELECTORS = [
  "input[type='password']",
  "input[autocomplete='current-password']",
  "input[autocomplete='new-password']",
];

function looksLikePasswordTextField(inp) {
  if (!inp || !(inp instanceof HTMLInputElement)) return false;
  const ty = (inp.type || "").toLowerCase();
  if (ty !== "text" && ty !== "") return false;
  const n = `${inp.name || ""} ${inp.id || ""}`.toLowerCase();
  const ph = (inp.getAttribute("placeholder") || "").toLowerCase();
  const ac = (inp.getAttribute("autocomplete") || "").toLowerCase();
  if (ac.includes("user") || ac.includes("email") || ac.includes("name")) return false;
  if (/search|query|q\b/.test(n) && !/pass/.test(n)) return false;
  return /pass|pwd|passwd|password|mima|parola/.test(n) || /password|passwd|passwort/.test(ph);
}

function findPasswordTextMasquerading(root) {
  if (!root) return null;
  try {
    for (const inp of root.querySelectorAll("input[type='text'], input:not([type])")) {
      if (inp instanceof HTMLInputElement && looksLikePasswordTextField(inp) && visible(inp)) {
        return inp;
      }
    }
    for (const node of root.querySelectorAll("*")) {
      if (node.shadowRoot) {
        const n = findPasswordTextMasquerading(node.shadowRoot);
        if (n) return n;
      }
    }
  } catch (_) {
    //
  }
  return null;
}

function findPasswordDeep(doc) {
  if (!doc) return null;
  let prefer = null;
  if (doc instanceof Document) prefer = resolveBestPasswordField(doc);
  else if (doc instanceof HTMLElement || doc instanceof DocumentFragment)
    prefer = resolveBestPasswordField(doc);
  if (prefer && visible(prefer)) return prefer;

  for (const sel of PASSWORD_SELECTORS) {
    const deep = querySelectorDeep(doc, sel);
    if (deep && visible(deep)) return deep;
  }
  for (const sel of PASSWORD_SELECTORS) {
    try {
      const qroot = doc instanceof Document ? doc : doc;
      for (const inp of qroot.querySelectorAll(sel)) {
        if (inp && visible(inp)) return inp;
      }
    } catch (_) {
      /* ignore */
    }
  }
  try {
    const qroot = doc instanceof Document ? doc : doc;
    for (const inp of qroot.querySelectorAll("input")) {
      if (!inp || !visible(inp)) continue;
      const a = (inp.getAttribute("autocomplete") || "").toLowerCase();
      if (a === "current-password" || a === "new-password") return inp;
    }
  } catch (_) {
    /* ignore */
  }
  const masqRoot = doc instanceof Document ? doc : doc;
  const masq = findPasswordTextMasquerading(masqRoot);
  if (masq) return masq;
  return null;
}

/** Password may live outside the form subtree (common on SPAs); respect form= and .form. */
function resolvePasswordFieldForSubmit(form) {
  let p = findPasswordDeep(form);
  if (p && visible(p)) return p;
  if (!(form instanceof HTMLFormElement)) return findPasswordDeep(document);
  p = findPasswordDeep(document);
  if (!p || !visible(p)) return null;
  if (p.form === form) return p;
  const fid = form.getAttribute("id");
  if (fid && p.getAttribute("form") === fid) return p;
  if (!p.form) return p;
  return null;
}

function findFallbackUsername(form, passwordField) {
  if (!(form instanceof HTMLFormElement) || !passwordField) return null;
  const fields = form.querySelectorAll("input, textarea");
  const list = [];

  for (const inp of fields) {
    if (!(inp instanceof HTMLInputElement || inp instanceof HTMLTextAreaElement)) continue;
    if (inp === passwordField) continue;
    if (!visible(inp)) continue;
    if (inp instanceof HTMLInputElement) {
      const ty = inp.type || "";
      if (
        ty === "hidden" ||
        ty === "submit" ||
        ty === "button" ||
        ty === "reset" ||
        ty === "checkbox" ||
        ty === "radio" ||
        ty === "file" ||
        ty === "image" ||
        ty === "password"
      ) {
        continue;
      }
    }
    list.push(inp);
  }

  for (const inp of list) {
    const auto = (inp.getAttribute("autocomplete") || "").toLowerCase();
    if (auto.includes("username") || auto.includes("email")) return inp;
    const name = ((inp.name || "") + (inp.id || "")).toLowerCase();
    if (/user|login|email|mail|account|phone|openid|identifier/.test(name)) return inp;
  }

  return list[0] || null;
}

function findUsernameNear(doc, form, passwordField) {
  const roots = [];
  if (form instanceof HTMLElement) roots.push(form);
  roots.push(doc);

  for (const root of roots) {
    const u1 = querySelectorDeep(root, "input[autocomplete='username']");
    if (u1 && visible(u1) && u1 !== passwordField) return u1;
    const u2 = querySelectorDeep(root, "input[autocomplete='email']");
    if (u2 && visible(u2) && u2 !== passwordField) return u2;
  }

  const root = form instanceof HTMLFormElement ? form : doc;
  const em = querySelectorDeep(root, "input[type='email']");
  if (em && visible(em)) return em;
  const pool = root.querySelectorAll(
    "input[type='text'], input[type='tel'], input[type='search'], input:not([type])"
  );
  for (const inp of pool) {
    if (!inp || !visible(inp)) continue;
    const auto = (inp.getAttribute("autocomplete") || "").toLowerCase();
    const nm = (inp.name || "").toLowerCase();
    const id = (inp.id || "").toLowerCase();
    const ph = (inp.getAttribute("placeholder") || "").toLowerCase();
    if (
      auto.includes("user") ||
      auto.includes("email") ||
      auto.includes("username") ||
      nm.includes("user") ||
      nm.includes("email") ||
      nm.includes("login") ||
      nm.includes("account") ||
      id.includes("email") ||
      id.includes("user") ||
      id.includes("login") ||
      ph.includes("email")
    )
      return inp;
  }
  if (passwordField) {
    let s = passwordField.previousElementSibling;
    for (let i = 0; i < 12 && s; i++) {
      if (
        s instanceof HTMLInputElement &&
        s.type !== "password" &&
        s.type !== "hidden" &&
        visible(s)
      )
        return s;
      const nested = s.querySelector?.(
        "input:not([type='password']):not([type='hidden'])"
      );
      if (nested instanceof HTMLInputElement && visible(nested)) return nested;
      s = s.previousElementSibling;
    }
    let p = passwordField.parentElement;
    for (let j = 0; j < 8 && p; j++) {
      for (const inp of Array.from(p.querySelectorAll("input"))) {
        if (
          inp instanceof HTMLInputElement &&
          inp !== passwordField &&
          inp.type !== "hidden" &&
          inp.type !== "password" &&
          visible(inp)
        )
          return inp;
      }
      p = p.parentElement;
    }
  }
  const g = querySelectorDeep(doc, "input[type='email']");
  if (g && visible(g)) return g;
  return null;
}

function setNativeInputValue(el, value) {
  const v = value == null ? "" : String(value);
  if (!el || !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
  el.focus({ preventScroll: true });
  const Proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
  try {
    const desc = Object.getOwnPropertyDescriptor(Proto.prototype, "value");
    if (desc && desc.set) desc.set.call(el, v);
    else el.value = v;
  } catch (_) {
    el.value = v;
  }
  el.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
  try {
    el.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        cancelable: true,
        inputType: "insertReplacementText",
        data: v,
      })
    );
  } catch (_) {
    /* empty */
  }
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

async function resolveCredential(items, suppressDismissNotice) {
  if (items.length === 1) return items[0];
  const choice = await showPickAccountOverlay(items);
  if (!choice && !suppressDismissNotice) {
    showMvBanner({
      title: "Myvault",
      detail: "No login was selected.",
    });
  }
  return choice || null;
}

/** @param opts {{ quietFetch?: boolean }} */
async function loadCredentials(hostname, opts) {
  const q = opts && opts.quietFetch;
  const res = await apiFetchCredentials(hostname);
  if (!res.ok) {
    if (!q) {
      if (res.error === "no_token")
        showMvBanner({
          title: "Extension setup",
          detail:
            "Open this extension’s options and paste the bearer token from Myvault ▸ Extension.",
        });
      else if (res.httpStatus === 401 || res.error === "unauthorized")
        showMvBanner({
          title: "Myvault",
          detail: "Unauthorized — verify the bearer token matches the desktop app.",
        });
      else if (res.httpStatus === 423 || res.error === "vault_locked")
        showMvBanner({
          title: "Vault locked",
          detail: "Unlock Myvault on this computer, then try again.",
        });
      else
        showMvBanner({
          title: "Can’t reach Myvault",
          detail: `Start the desktop app, unlock your vault, and check the API port${res.httpStatus ? ` (HTTP ${res.httpStatus})` : ""}.`,
        });
    }
    return null;
  }
  const items = res.items || [];
  if (!items.length) {
    if (!q)
      showMvBanner({
        title: "Myvault",
        detail: "No saved logins match this website.",
      });
    return null;
  }
  return resolveCredential(items, false);
}

async function vaultAutofill() {
  const passField = findPasswordDeep(document);
  if (!passField) return { skipped: true };
  passField.focus({ preventScroll: true });
  const host = window.location.hostname;
  const cred = await loadCredentials(host, { quietFetch: false });
  if (!cred) return { aborted: true };
  await fillFromCredential(passField, cred);
  return { filled: true };
}

/** Memory-only dedupe resets on full reload (new content-script isolate). Avoid sessionStorage — it survives reload and blocked auto-fill after refresh. */
let mvAutoCompletedForFingerprint = "";
let mvAutoBusy = false;
let mvTrackedHref = "";

function mvPageFingerprint() {
  return `${location.origin}${location.pathname}${location.search}${location.hash}`;
}

function mvHrefSync() {
  if (location.href !== mvTrackedHref) {
    mvTrackedHref = location.href;
    mvAutoCompletedForFingerprint = "";
  }
}

async function maybeAutoPickMultiAccounts() {
  try {
    if (document.visibilityState === "hidden") return;
    mvHrefSync();
    const fp = mvPageFingerprint();
    if (mvAutoCompletedForFingerprint === fp || mvAutoBusy) return;

    const pass = findPasswordDeep(document);
    if (!pass || !visible(pass)) return;

    mvAutoBusy = true;
    let markComplete = false;
    try {
      const host = window.location.hostname;
      const res = await apiFetchCredentials(host);

      if (!res.ok || !res.items?.length) {
        return;
      }

      const items = res.items;

      if (items.length === 1) {
        if (String(pass.value || "").trim()) {
          markComplete = true;
          return;
        }
        const cred = items[0];
        await fillFromCredential(pass, cred);
        const expect = String(cred.password || "").trim();
        const got = String(pass.value || "").trim();
        if (expect && !got) {
          await new Promise((r) => setTimeout(r, 120));
          await fillFromCredential(pass, cred);
        }
        if (
          expect &&
          !String(pass.value || "").trim()
        ) {
          mvAutoRetriesByFp.set(fp, (mvAutoRetriesByFp.get(fp) || 0) + 1);
          const n = mvAutoRetriesByFp.get(fp) || 0;
          if (n < 6) queueAutoDetect();
          return;
        }
        markComplete = true;
        return;
      }

      const pick = await showPickAccountOverlay(items);
      if (!pick) {
        markComplete = true;
        return;
      }
      await fillFromCredential(pass, pick);
      markComplete = true;
    } finally {
      mvAutoBusy = false;
      if (markComplete) {
        mvAutoCompletedForFingerprint = fp;
        mvAutoRetriesByFp.delete(fp);
      }
    }
  } catch (_) {
    mvAutoBusy = false;
  }
}

let mvAutoTimer;

function queueAutoDetect() {
  mvHrefSync();
  clearTimeout(mvAutoTimer);
  mvAutoTimer = setTimeout(() => void maybeAutoPickMultiAccounts(), 1100);
}

let mvVaultLoginOfferBusy = false;
let mvVaultLoginOfferSigTs = 0;
let mvVaultLoginOfferLastSig = "";

function shouldDedupeVaultLoginOffer(sig) {
  const now = Date.now();
  if (sig === mvVaultLoginOfferLastSig && now - mvVaultLoginOfferSigTs < 3800) return true;
  mvVaultLoginOfferLastSig = sig;
  mvVaultLoginOfferSigTs = now;
  return false;
}

/**
 * Save-login modal + API. `invokeResume` runs after flow (e.g. continue native form submit).
 * @param {() => void} [invokeResume]
 */
async function runVaultLoginSaveOffer(username, password, invokeResume) {
  const hostLabel = window.location.hostname;
  const u = String(username || "").trim();
  const pw = String(password || "");
  if (!u || !pw.trim()) return;

  const sig = `${hostLabel}|${u}|${pw}`;
  if (shouldDedupeVaultLoginOffer(sig)) return;
  if (mvVaultLoginOfferBusy) return;

  mvVaultLoginOfferBusy = true;
  try {
    const dlg = await showSaveLoginModal(hostLabel, hostLabel, u, pw);
    if (dlg.declined) {
      invokeResume?.();
      return;
    }
    const res = await apiSaveCredential({
      url: window.location.href,
      username: dlg.username || u,
      password: dlg.password || pw,
      title: dlg.title || "",
      categoryId: dlg.categoryId,
    });

    if (!res.ok) {
      showMvBanner({
        title: "Could not save",
        detail: String(res.httpStatus || res.error || "Unknown error"),
      });
      invokeResume?.();
      return;
    }

    showMvToast("Saved to Myvault.");
    invokeResume?.();
  } finally {
    mvVaultLoginOfferBusy = false;
  }
}

if (!globalThis.__MYVAULT_INIT__) {
  globalThis.__MYVAULT_INIT__ = true;

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "MYVAULT_HOST_TOAST") {
      try {
        if (msg.mode === "toast" && msg.text) {
          showMvToast(String(msg.text));
        } else {
          showMvBanner({
            title: msg.title || "Myvault",
            detail: msg.detail || msg.text || "",
          });
        }
        sendResponse({ ok: true });
      } catch (_) {
        sendResponse({ ok: false });
      }
      return true;
    }
    if (!msg || msg.type !== "VAULT_AUTOFILL") return undefined;
    void vaultAutofill()
      .then((r) => sendResponse(r || { skipped: true }))
      .catch(() => sendResponse({ error: true }));
    return true;
  });

  document.addEventListener(
    "submit",
    async (e) => {
      const form = e.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (form.dataset.mvBypass === "1") {
        delete form.dataset.mvBypass;
        return;
      }

      const passwordField = resolvePasswordFieldForSubmit(form);
      if (!passwordField || !visible(passwordField)) return;
      let usernameField = findUsernameForPasswordGlobally(passwordField, form);
      if (!usernameField) usernameField = findUsernameNear(document, form, passwordField);
      if (!usernameField) usernameField = findFallbackUsername(form, passwordField);
      if (!usernameField || !visible(usernameField)) {
        dismissMvOverlays();
        showMvBanner({
          title: "Can’t find username field",
          detail:
            "Myvault needs an email or username field next to the password. If this page uses a custom layout, fill both fields and try the toolbar button to save.",
        });
        return;
      }
      const password = getInputValue(passwordField);
      const username = getInputValue(usernameField);
      if (!password.trim()) {
        dismissMvOverlays();
        const uTrim = username.trim();
        if (uTrim) {
          showMvBanner({
            title: "Password required to save",
            detail: `You entered “${uTrim.slice(0, 56)}${uTrim.length > 56 ? "…" : ""}” — add your password, then submit again so Myvault can save this login. To skip saving, just log in as usual.`,
          });
        } else {
          showMvBanner({
            title: "Missing username and password",
            detail:
              "Fill in both fields, then submit again. Myvault only saves when it can read both from this page.",
          });
        }
        return;
      }

      e.preventDefault();

      const resumeSubmit = () => {
        form.dataset.mvBypass = "1";
        HTMLFormElement.prototype.submit.call(form);
      };

      await runVaultLoginSaveOffer(username.trim(), password, resumeSubmit);
    },
    true
  );

  document.addEventListener(
    "focusin",
    (ev) => {
      const el = ev.target;
      if (el instanceof HTMLInputElement && el.type === "password") mvLastPasswordField = el;
    },
    true
  );

  document.addEventListener(
    "click",
    (ev) => {
      const raw = ev.target;
      if (!(raw instanceof Element)) return;
      const btn = raw.closest(
        'button, [role="button"], input[type="submit"], input[type="button"], a[href][role="button"]'
      );
      if (!(btn instanceof HTMLElement)) return;
      if (!looksLikeLoginButton(btn)) return;
      if (isLikelyNativeFormSubmitControl(btn)) return;

      const pwdField = resolveBestPasswordField(document);
      if (!pwdField || !visible(pwdField)) return;
      const formHint = pwdField.closest("form");
      let usernameField = findUsernameForPasswordGlobally(pwdField, formHint || undefined);
      if (!usernameField) usernameField = findFallbackUsername(formHint, pwdField);

      const password = getInputValue(pwdField);
      const username = usernameField ? getInputValue(usernameField) : "";

      if (!password.trim() || !username.trim()) {
        requestAnimationFrame(() => {
          const p2 = resolveBestPasswordField(document);
          if (!p2 || !visible(p2)) return;
          const f2 = p2.closest("form");
          let u2 = findUsernameForPasswordGlobally(p2, f2 || undefined);
          if (!u2) u2 = findFallbackUsername(f2, p2);
          const pw2 = getInputValue(p2);
          const us2 = u2 ? getInputValue(u2) : "";
          if (pw2.trim() && us2.trim()) void runVaultLoginSaveOffer(us2, pw2, undefined);
        });
        return;
      }

      void runVaultLoginSaveOffer(username.trim(), password, undefined);
    },
    true
  );

  setTimeout(queueAutoDetect, 300);
  window.addEventListener("load", queueAutoDetect);
  window.addEventListener("pageshow", (ev) => {
    if (ev.persisted) {
      mvAutoCompletedForFingerprint = "";
    }
    queueAutoDetect();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") queueAutoDetect();
  });
  new MutationObserver(() => queueAutoDetect()).observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
  });

  queueAutoDetect();
}
