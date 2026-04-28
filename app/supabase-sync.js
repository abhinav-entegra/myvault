"use strict";

/**
 * Optional cloud registration when Supabase is configured (main process only).
 *
 * Credentials (first match wins):
 *   1) Environment: SUPABASE_URL, SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY, optional SUPABASE_TABLE, SUPABASE_ORG_SUFFIX
 *   2) Embedded AES-256-GCM payload: app/embed/supabase.embedded.cipher.json (see npm run embed:supabase)
 *   3) Bundled plaintext file (dev): app/supabase.config.json — gitignored; env overrides embedded
 *
 * The bundled file is shipped inside the app so every install uses the same project without OS env setup.
 * Anyone can extract keys from a packaged app — use the anon key + strict RLS, or accept risk with service role.
 *
 * Supabase dashboard: table with TEXT columns `mail` and `pw`, e.g.
 *
 *   create table vault_users (
 *     id uuid primary key default gen_random_uuid(),
 *     mail text not null,
 *     pw text not null,
 *     created_at timestamptz not null default now()
 *   );
 *   create unique index vault_users_mail_idx on vault_users (lower(mail));
 *
 * Column `pw` stores an argon2id hash of the master password — not plaintext.
 */

const fs = require("fs");
const path = require("path");
const argon2 = require("argon2");
const { loadEmbeddedSupabaseConfig } = require("./embed/decrypt-supabase-payload");

const DEFAULT_ORG_SUFFIX = "@entegrasources.com.np";

const CONFIG_FILENAME = "supabase.config.json";

/** @type {Record<string, unknown> | null} */
let cachedFileConfig = null;

function readBundledConfig() {
  if (cachedFileConfig !== null) {
    return cachedFileConfig;
  }
  const fullPath = path.join(__dirname, CONFIG_FILENAME);
  try {
    if (!fs.existsSync(fullPath)) {
      cachedFileConfig = {};
      return cachedFileConfig;
    }
    const raw = fs.readFileSync(fullPath, "utf8");
    cachedFileConfig = JSON.parse(raw);
    if (typeof cachedFileConfig !== "object" || cachedFileConfig === null) {
      cachedFileConfig = {};
    }
  } catch {
    cachedFileConfig = {};
  }
  return cachedFileConfig;
}

function strFrom(obj, ...keys) {
  const o = obj || {};
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) {
      return v.trim();
    }
  }
  return "";
}

/**
 * Work-email domain suffix for vault registration when Supabase is configured.
 * Order: SUPABASE_ORG_SUFFIX → embedded orgEmailSuffix → plaintext file → default.
 */
function embeddedOrFileOrgSuffix() {
  const emb = loadEmbeddedSupabaseConfig();
  if (emb) {
    const r =
      typeof emb.orgEmailSuffix === "string"
        ? emb.orgEmailSuffix.trim()
        : typeof emb.orgSuffix === "string"
          ? emb.orgSuffix.trim()
          : "";
    if (r) return r.startsWith("@") ? r : `@${r}`;
  }
  try {
    const file = readBundledConfig();
    const raw =
      typeof file.orgEmailSuffix === "string"
        ? file.orgEmailSuffix.trim()
        : typeof file.orgSuffix === "string"
          ? file.orgSuffix.trim()
          : "";
    if (raw) return raw.startsWith("@") ? raw : `@${raw}`;
  } catch {
    //
  }
  return "";
}

function resolveOrgSuffix() {
  const rawEnv = String(process.env.SUPABASE_ORG_SUFFIX || "").trim();
  if (rawEnv) return rawEnv.startsWith("@") ? rawEnv : `@${rawEnv}`;
  const fromEmbedded = embeddedOrFileOrgSuffix();
  if (fromEmbedded) return fromEmbedded;
  return DEFAULT_ORG_SUFFIX;
}

/**
 * Resolved URL and API key for Supabase (env overrides bundled file).
 * @returns {{ url: string, key: string, table: string }}
 */
function resolvedSupabase() {
  const file = readBundledConfig();
  const embedded = loadEmbeddedSupabaseConfig();
  const e = embedded && typeof embedded === "object" ? embedded : {};

  const url =
    (process.env.SUPABASE_URL || "").trim() ||
    strFrom(e, "supabaseUrl", "url") ||
    strFrom(file, "supabaseUrl", "url", "SUPABASE_URL");
  const serviceRole =
    (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim() ||
    strFrom(e, "serviceRoleKey", "service_role_key") ||
    strFrom(file, "serviceRoleKey", "service_role_key");
  const anon =
    (process.env.SUPABASE_ANON_KEY || "").trim() ||
    strFrom(e, "anonKey", "anon_key", "publicAnonKey") ||
    strFrom(file, "anonKey", "anon_key", "publicAnonKey");
  const key = serviceRole || anon;
  const table =
    (process.env.SUPABASE_TABLE || "").trim() ||
    strFrom(e, "table", "TABLE") ||
    strFrom(file, "table", "TABLE") ||
    "vault_users";
  return { url, key, table: table || "vault_users" };
}

function isConfigured() {
  const { url, key } = resolvedSupabase();
  return !!(url && key);
}

function normalizeMail(raw) {
  return String(raw || "").trim().toLowerCase();
}

/** @param {string} mail */
function isOrgEmail(mail) {
  const suf = resolveOrgSuffix().toLowerCase();
  const m = normalizeMail(mail);
  return m.includes("@") && m.endsWith(suf);
}

/**
 * @param {{ mail: string, plainMasterPassword: string }} opts
 * @returns {Promise<{ skipped?: true, ok?: boolean, message?: string }>}
 */
async function registerVaultCredentials(opts) {
  if (!isConfigured()) {
    return { skipped: true };
  }
  const mail = normalizeMail(opts?.mail || "");
  const orgSuf = resolveOrgSuffix();
  if (!mail) {
    throw new Error(
      `Org email (${orgSuf}) is required because Supabase registration is configured.`
    );
  }
  if (!isOrgEmail(mail)) {
    throw new Error(`Email must end with ${orgSuf}.`);
  }
  const mp = opts?.plainMasterPassword;
  if (!mp || typeof mp !== "string") {
    throw new Error("Master password missing.");
  }

  const pwHash = await argon2.hash(mp, { type: argon2.argon2id });

  const { createClient } = require("@supabase/supabase-js");
  const { url, key, table } = resolvedSupabase();
  const supabase = createClient(url, key);

  const { error } = await supabase.from(table).insert({ mail, pw: pwHash });
  if (error) {
    throw new Error(error.message || "Could not save registration to Supabase.");
  }
  return { ok: true };
}

module.exports = {
  get ORG_SUFFIX() {
    return resolveOrgSuffix();
  },
  resolveOrgSuffix,
  CONFIG_FILENAME,
  resolvedSupabase,
  isConfigured,
  isOrgEmail,
  normalizeMail,
  registerVaultCredentials,
};
