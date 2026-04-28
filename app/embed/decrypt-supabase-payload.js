"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { deriveEmbeddedKey } = require("./derive-embedded-key");

const CIPHER_FILE = path.join(__dirname, "supabase.embedded.cipher.json");

/** @type {Record<string, unknown> | null | undefined} */
let cached = undefined;

/**
 * @returns {Record<string, unknown> | null}
 */
function loadEmbeddedSupabaseConfig() {
  if (cached !== undefined) return cached;
  cached = null;
  try {
    if (!fs.existsSync(CIPHER_FILE)) return cached;
    const raw = fs.readFileSync(CIPHER_FILE, "utf8");
    const bundle = JSON.parse(raw);
    if (bundle.v !== 1 || typeof bundle.iv !== "string" || typeof bundle.ct !== "string") {
      return cached;
    }
    const iv = Buffer.from(bundle.iv, "hex");
    const tag = Buffer.from(bundle.tag, "hex");
    const ct = Buffer.from(bundle.ct, "hex");
    const key = deriveEmbeddedKey();
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
    const obj = JSON.parse(plain);
    if (typeof obj === "object" && obj !== null) {
      cached = obj;
    }
  } catch {
    cached = null;
  }
  return cached;
}

function clearEmbeddedCache() {
  cached = undefined;
}

module.exports = {
  loadEmbeddedSupabaseConfig,
  clearEmbeddedCache,
  CIPHER_FILE,
};
