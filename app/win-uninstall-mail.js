"use strict";

/**
 * Mirrors registration email for Windows uninstall-time Supabase purge when local DB may be removed early.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

/** HKCU\Software\Classes\com.passapp.vault\UninstallMirror */
const KEY_PATH =
  "HKCU\\Software\\Classes\\com.passapp.vault\\UninstallMirror";

function normalizeMail(mail) {
  const m = String(mail || "").trim().toLowerCase();
  return m.includes("@") ? m : "";
}

function persistRegMailForUninstall(mail) {
  if (process.platform !== "win32") return;
  const m = normalizeMail(mail);
  if (!m) return;
  try {
    execFileSync(
      "reg.exe",
      ["ADD", KEY_PATH, "/v", "RegMail", "/t", "REG_SZ", "/d", m, "/f"],
      { windowsHide: true }
    );
  } catch {
    //
  }

  try {
    const fallback = path.join(os.homedir(), ".myvault-uninstall-ref.json");
    fs.writeFileSync(
      fallback,
      JSON.stringify({ regMail: m, ts: Date.now() }),
      "utf8"
    );
  } catch {
    //
  }
}

function readRegMailForUninstall() {
  if (process.platform !== "win32") return "";
  try {
    const out = execFileSync("reg.exe", ["QUERY", KEY_PATH, "/v", "RegMail"], {
      encoding: "utf8",
      windowsHide: true,
    });
    const s = typeof out === "string" ? out : "";
    const ln = s.split(/\r?\n/).find((l) => /\bREG_SZ\b/i.test(l));
    if (!ln) return "";
    const parts = ln.split(/REG_SZ/i);
    const tail = parts.length > 1 ? parts[parts.length - 1] : "";
    return normalizeMail(tail);
  } catch {
    return "";
  }
}

function readFileFallbackMail() {
  try {
    const fallback = path.join(os.homedir(), ".myvault-uninstall-ref.json");
    if (!fs.existsSync(fallback)) return "";
    const raw = fs.readFileSync(fallback, "utf8");
    const o = JSON.parse(raw);
    return normalizeMail(o?.regMail ?? "");
  } catch {
    return "";
  }
}

function clearRegMailBackup() {
  if (process.platform !== "win32") return;
  try {
    execFileSync("reg.exe", ["DELETE", KEY_PATH, "/v", "RegMail", "/f"], {
      windowsHide: true,
    });
  } catch {
    //
  }

  try {
    const fallback = path.join(os.homedir(), ".myvault-uninstall-ref.json");
    if (fs.existsSync(fallback)) fs.unlinkSync(fallback);
  } catch {
    //
  }

  /** Remove empty key subtree if unused (ignore errors). */
  try {
    execFileSync("reg.exe", ["DELETE", KEY_PATH, "/f"], { windowsHide: true });
  } catch {
    //
  }
}

module.exports = {
  persistRegMailForUninstall,
  readRegMailForUninstall,
  readFileFallbackMail,
  clearRegMailBackup,
};
