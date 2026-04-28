#!/usr/bin/env node
"use strict";

/**
 * Dev helper: bumps a version token when extension/* files change.
 * Loaded extension polls http://127.0.0.1:PORT/version and reloads itself (see extension/background.js).
 *
 * Usage: npm run ext:dev-reload
 * Env: MYVAULT_EXT_RELOAD_PORT (default 37528)
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const EXT_DIR = path.resolve(__dirname, "..", "extension");
const PORT = parseInt(process.env.MYVAULT_EXT_RELOAD_PORT || "37528", 10);

let nonce = String(Date.now());
let bumpTimer = null;

function bumpNonce() {
  nonce = String(Date.now());
}

function scheduleBump() {
  if (bumpTimer) {
    clearTimeout(bumpTimer);
  }
  bumpTimer = setTimeout(() => {
    bumpTimer = null;
    bumpNonce();
    console.log(`[extension-live-reload] files changed → bump ${nonce}`);
  }, 80);
}

const ALLOWED_SUFFIX = /\.(js|json|html|css|png|svg|webp)$/i;

const server = http.createServer((_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.statusCode = 200;
  res.end(nonce);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(
    `[extension-live-reload] http://127.0.0.1:${PORT}/version watching ${EXT_DIR}`
  );

  try {
    fs.watch(EXT_DIR, { recursive: true }, (_event, fname) => {
      if (!fname || !ALLOWED_SUFFIX.test(fname)) {
        return;
      }
      scheduleBump();
    });
  } catch (e) {
    console.error("[extension-live-reload] fs.watch failed:", e.message);
    process.exit(1);
  }
});

server.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    console.error(`[extension-live-reload] port ${PORT} in use (${err.message}).`);
    process.exit(1);
  }
  throw err;
});
