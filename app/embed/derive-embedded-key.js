"use strict";

/**
 * Derives the 32-byte AES key used to encrypt embedded Supabase settings.
 * Material is split across this module so raw JWTs never appear in source.
 * Anyone with the app can still decrypt (defense-in-depth, not secret storage).
 */

const crypto = require("crypto");

const SCRYPT_SALT = Buffer.from("8f2a1c9e4b7d3065a1e8c4f290d6b3e7a0c5d8f142e9b6a7c3d0f8e1b4a9c6d2", "hex");

function labelBytes() {
  return Buffer.from(
    [0x6d, 0x79, 0x76, 0x61, 0x75, 0x6c, 0x74, 0x2d, 0x65, 0x6d, 0x62, 0x65, 0x64, 0x2d, 0x31, 0x2e]
  );
}

function deriveEmbeddedKey() {
  const pkg = require("../../package.json");
  const material = Buffer.concat([
    Buffer.from("com.passapp.vault|embed|v1|", "utf8"),
    Buffer.from(String(pkg.name || "vault-manager"), "utf8"),
    labelBytes(),
  ]);
  return crypto.scryptSync(material, SCRYPT_SALT, 32, { N: 16384, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
}

module.exports = { deriveEmbeddedKey };
