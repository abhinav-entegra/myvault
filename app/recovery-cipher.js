"use strict";

/**
 * Encrypts the master password for Supabase-backed recovery (`recovery_cipher` column).
 * Key derivation uses embedded app material + lowercase mail — same installs can decrypt pasted blobs.
 */

const crypto = require("crypto");
const vaultCrypto = require("./crypto");
const { deriveEmbeddedKey } = require("./embed/derive-embedded-key");

function normalizeMailLower(raw) {
  return String(raw || "").trim().toLowerCase();
}

/** @returns {Buffer} */
function deriveRecoveryWrapKey(mail) {
  const base = deriveEmbeddedKey();
  return crypto.hkdfSync(
    "sha256",
    base,
    Buffer.from(normalizeMailLower(mail), "utf8"),
    Buffer.from("myvault-recovery-wrap-v1", "utf8"),
    32,
  );
}

/**
 * @param {string} plainMasterPassword
 * @param {string} mail
 * @returns {{ iv: string, tag: string, data: string }}
 */
function encryptRecoveryEnvelope(plainMasterPassword, mail) {
  const key = deriveRecoveryWrapKey(mail);
  try {
    return vaultCrypto.encryptBlob(plainMasterPassword, key);
  } finally {
    vaultCrypto.wipeBuffer(key);
  }
}

/**
 * @param {{ iv: string, tag: string, data: string }} envelope
 * @param {string} mail
 * @returns {string} UTF-8 master password string (may wipe after use by caller)
 */
function decryptRecoveryEnvelope(envelope, mail) {
  const key = deriveRecoveryWrapKey(mail);
  try {
    const buf = vaultCrypto.decryptBlob(envelope, key);
    return buf.toString("utf8");
  } finally {
    vaultCrypto.wipeBuffer(key);
  }
}

module.exports = {
  normalizeMailLower,
  encryptRecoveryEnvelope,
  decryptRecoveryEnvelope,
};
