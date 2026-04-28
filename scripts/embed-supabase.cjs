"use strict";

/**
 * Encrypts app/supabase.config.json → app/embed/supabase.embedded.cipher.json
 * Run after editing the local (gitignored) config: npm run embed:supabase
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { deriveEmbeddedKey } = require("../app/embed/derive-embedded-key");

const root = path.join(__dirname, "..");
const src = path.join(root, "app", "supabase.config.json");
const dest = path.join(root, "app", "embed", "supabase.embedded.cipher.json");

if (!fs.existsSync(src)) {
  console.error("Missing app/supabase.config.json — copy from supabase.config.sample.json and fill values.");
  process.exit(1);
}

const stripReadme = (obj) => {
  const o = { ...obj };
  delete o._readme;
  return o;
};

const cfg = stripReadme(JSON.parse(fs.readFileSync(src, "utf8")));
const plain = Buffer.from(JSON.stringify(cfg), "utf8");
const key = deriveEmbeddedKey();
const iv = crypto.randomBytes(12);
const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
const tag = cipher.getAuthTag();

const bundle = {
  v: 1,
  alg: "aes-256-gcm-scrypt",
  iv: iv.toString("hex"),
  tag: tag.toString("hex"),
  ct: ct.toString("hex"),
};

fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
console.log(`Wrote ${path.relative(root, dest)} (${plain.length} bytes plaintext).`);
