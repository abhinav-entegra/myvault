"use strict";

const http = require("http");

const express = require("express");

const session = require("./session");
const vault = require("./vault-logic");

const RATE_LIMIT_MAX = 120;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

const hits = new Map();

function pruneRate(ip, now) {
  const windowStart = hits.get(ip);

  if (!windowStart || now - windowStart.t > RATE_LIMIT_WINDOW_MS) {
    hits.set(ip, { t: now, n: 0 });

    return hits.get(ip);
  }

  return windowStart;
}

function rateLimitMiddleware(req, res, next) {
  const ip = req.socket.remoteAddress || "local";
  const now = Date.now();
  const w = pruneRate(ip, now);

  w.n += 1;

  if (w.n > RATE_LIMIT_MAX) {
    return res.status(429).json({ error: "Too many requests" });
  }

  next();
}

function corsMiddleware(req, res, next) {
  const origin = req.headers.origin;

  if (/^chrome-extension:\/\/.+/.test(origin || "")) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
}

function bearerAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  const token = match ? match[1].trim() : "";
  const expected = session.getExtensionToken();

  if (!expected || token !== expected) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
}

function vaultUnlocked(req, res, next) {
  if (!session.isUnlocked()) {
    return res.status(423).json({ error: "Vault locked" });
  }

  next();
}

function createApp() {
  const app = express();

  app.use(corsMiddleware);
  app.use(express.json({ limit: "256kb" }));

  app.get("/health", rateLimitMiddleware, (req, res) => {
    res.json({
      ok: true,
      locked: !session.isUnlocked(),
    });
  });

  app.get(
    "/api/credentials",
    rateLimitMiddleware,
    bearerAuth,
    vaultUnlocked,
    (req, res) => {
      const hostname = (req.query.hostname || req.query.url || "").toString();

      if (!hostname) {
        return res.status(400).json({ error: "hostname required" });
      }

      const items = vault.findForHostname(hostname);

      res.json({
        items: items.map((e) => ({
          id: e.id,
          url: e.url,
          username: e.username,
          password: e.password,
          title: e.title || "",
          favorite: e.favorite,
          lastUsed: e.lastUsed,
        })),
      });
    }
  );

  app.get(
    "/api/categories",
    rateLimitMiddleware,
    bearerAuth,
    vaultUnlocked,
    async (_req, res) => {
      try {
        const categories = await vault.listCategories();

        res.json({ categories });

      } catch (e) {

        res.status(500).json({ error: e.message || "list categories failed" });

      }

    }

  );


  app.post(
    "/api/credentials",
    rateLimitMiddleware,
    bearerAuth,
    vaultUnlocked,
    async (req, res) => {
      const body = req.body || {};
      const url = (body.url || "").toString().trim();

      const username = (body.username || "").toString();

      const password = (body.password || "").toString();

      const title =
        typeof body.title === "string" ? body.title.slice(0, 160) : "";

      const notes =
        typeof body.notes === "string" ? body.notes.slice(0, 8000) : "";

      const favorite = !!body.favorite;

      if (!url) {
        return res.status(400).json({ error: "url required" });
      }

      try {
        const r = await vault.addCredential({
          url,
          username,
          password,
          title,
          notes,
          favorite,
          categoryId: body.categoryId != null ? body.categoryId : undefined,
        });

        res.json({ status: "saved", id: r.id });
      } catch (e) {
        res.status(500).json({ error: e.message || "save failed" });
      }
    }
  );

  return app;
}

let serverInstance = null;

function startLocalServer(port) {
  if (serverInstance) {
    return serverInstance;
  }

  const app = createApp();
  const server = http.createServer(app);

  server.listen(port, "127.0.0.1", () => {

    // eslint-disable-next-line no-console

    console.log(`Local API listening on http://127.0.0.1:${port}`);
  });

  serverInstance = server;

  return server;
}

function getLocalPort() {
  return serverInstance && serverInstance.address()
    ? serverInstance.address().port
    : null;
}

module.exports = { createApp, startLocalServer, getLocalPort };
