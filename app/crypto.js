"use strict";

const crypto = require("crypto");
const argon2 = require("argon2");

const ARGON2_PARAMS = {
  type: argon2.argon2id,
  memoryCost: 2 ** 16,
  timeCost: 3,
  parallelism: 1,
  hashLength: 32,
};

function randomSalt(bytes = 32) {
  return crypto.randomBytes(bytes);
}

/**
 * Derive a 32-byte raw key from the master password and salt using Argon2id.
 */
async function deriveMasterKey(masterPassword, salt) {
  if (!Buffer.isBuffer(salt)) {
    salt = Buffer.from(salt);
  }

  const key = await argon2.hash(masterPassword, {
    ...ARGON2_PARAMS,
    salt,
    raw: true,
  });

  return Buffer.from(key);
}

function wipeBuffer(buf) {
  if (Buffer.isBuffer(buf) && buf.length) {
    buf.fill(0);
  }
}

function encryptBlob(plainUtf8OrBuffer, key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) {
    throw new Error("encryption key must be 32 bytes");
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const input = Buffer.isBuffer(plainUtf8OrBuffer)
    ? plainUtf8OrBuffer
    : Buffer.from(plainUtf8OrBuffer, "utf8");

  const encrypted = Buffer.concat([cipher.update(input), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    data: encrypted.toString("hex"),
  };
}

function decryptBlob(payload, key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) {
    throw new Error("decryption key must be 32 bytes");
  }

  const iv = Buffer.from(payload.iv, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);

  decipher.setAuthTag(Buffer.from(payload.tag, "hex"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.data, "hex")),
    decipher.final(),
  ]);

  return decrypted;
}

function encryptJson(obj, key) {
  const json = JSON.stringify(obj);
  return encryptBlob(json, key);
}

function decryptJson(payload, key) {
  const buf = decryptBlob(payload, key);
  try {
    return JSON.parse(buf.toString("utf8"));
  } finally {
    wipeBuffer(buf);
  }
}

const VERIFIER_PLAINTEXT = "__VAULT_VERIFY__";

async function encryptVerifier(key) {
  return encryptBlob(VERIFIER_PLAINTEXT, key);
}

function verifyDecrypt(verifierPayload, key) {
  try {
    const decrypted = decryptBlob(verifierPayload, key).toString("utf8");

    return decrypted === VERIFIER_PLAINTEXT;
  } catch {
    return false;
  }
}

module.exports = {
  randomSalt,
  deriveMasterKey,
  encryptBlob,
  decryptBlob,
  encryptJson,
  decryptJson,
  encryptVerifier,
  verifyDecrypt,
  wipeBuffer,
  ARGON2_PARAMS,
};
