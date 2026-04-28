"use strict";

const DEFAULT_API = "http://127.0.0.1:58491";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "MYVAULT_HEALTH_CHECK") {
    return handleHealthCheck(message, sendResponse);
  }

  if (message?.type === "MYVAULT_FETCH_CREDS") {
    return handleFetchCreds(message, sendResponse);
  }

  if (message?.type === "MYVAULT_SAVE_CRED") {
    return handleSaveCred(message, sendResponse);
  }

  if (message?.type === "MYVAULT_LIST_CATEGORIES") {
    return handleListCategories(message, sendResponse);
  }

  return undefined;
});

function handleHealthCheck(message, sendResponse) {
  const raw = String(message.baseUrl || "").trim().replace(/\/$/, "");

  if (!raw || (!raw.startsWith("http://") && !raw.startsWith("https://"))) {
    sendResponse({
      ok: false,
      error:
        raw === ""
          ? "Enter an API base URL (e.g. http://127.0.0.1:58491)."
          : "URL must start with http:// or https://",
    });
    return false;
  }

  const url = `${raw}/health`;

  fetch(url, { method: "GET", cache: "no-store" })
    .then(async (r) => {
      const text = await r.text();
      let data = null;

      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }

      if (!r.ok) {
        sendResponse({
          ok: false,
          error: data?.error ? String(data.error) : `HTTP ${r.status}`,
        });
        return;
      }

      const locked =
        data && typeof data.locked === "boolean" ? data.locked : false;

      sendResponse({
        ok: true,
        locked,
        hint: locked ? "vault locked in app — unlock Myvault." : "vault unlocked.",
      });
    })
    .catch((e) => {
      sendResponse({
        ok: false,
        error:
          e && e.message === "Failed to fetch"
            ? "Cannot reach desktop app. Start Myvault, unlock the vault, verify port in Myvault ▸ Extension, then Retry."
            : e.message || String(e),
      });
    });

  return true;
}

function getStoredApi() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(
      { baseUrl: DEFAULT_API, token: "" },
      (cfg) => resolve(cfg || { baseUrl: DEFAULT_API, token: "" })
    );
  });
}

function handleFetchCreds(message, sendResponse) {
  const hostname = String(message.hostname || "").trim();

  if (!hostname) {
    sendResponse({ ok: false, error: "hostname required", items: [] });
    return false;
  }

  void (async () => {
    try {
      const cfg = await getStoredApi();

      if (!cfg.token) {
        sendResponse({
          ok: false,
          error: "no_token",
          items: [],
        });
        return;
      }

      const base = String(cfg.baseUrl || DEFAULT_API).replace(/\/$/, "");
      const url = `${base}/api/credentials?hostname=${encodeURIComponent(hostname)}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${cfg.token}` },
      });

      const text = await res.text();
      let data = null;

      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }

      if (!res.ok) {
        sendResponse({
          ok: false,
          httpStatus: res.status,
          error:
            data?.error ||
            (res.status === 423
              ? "vault_locked"
              : res.status === 401 || res.status === 403
                ? "unauthorized"
                : `http_${res.status}`),
          items: [],
        });
        return;
      }

      sendResponse({
        ok: true,
        items: Array.isArray(data?.items) ? data.items : [],
      });
    } catch (e) {
      sendResponse({
        ok: false,
        error: e?.message || String(e),
        items: [],
      });
    }
  })();

  return true;
}

function handleSaveCred(message, sendResponse) {
  void (async () => {
    try {
      const cfg = await getStoredApi();

      if (!cfg.token) {
        sendResponse({ ok: false, error: "no_token" });
        return;
      }

      const base = String(cfg.baseUrl || DEFAULT_API).replace(/\/$/, "");
      const res = await fetch(`${base}/api/credentials`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cfg.token}`,
        },
        body: JSON.stringify({
          url: message.url || "",
          username: message.username || "",
          password: message.password || "",
          title: message.title ?? "",
          notes: message.notes ?? "",
          categoryId: message.categoryId,
          favorite: !!message.favorite,
        }),
      });

      const text = await res.text();
      let data = null;

      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }

      if (!res.ok) {
        sendResponse({
          ok: false,
          httpStatus: res.status,
          error: data?.error || `HTTP ${res.status}`,
        });
        return;
      }

      sendResponse({ ok: true });
    } catch (e) {
      sendResponse({ ok: false, error: e?.message || String(e) });
    }
  })();

  return true;
}

function handleListCategories(_message, sendResponse) {
  void (async () => {
    try {
      const cfg = await getStoredApi();

      if (!cfg.token) {
        sendResponse({
          ok: false,
          error: "no_token",

          categories: [],

        });
        return;

      }


      const base = String(cfg.baseUrl || DEFAULT_API).replace(/\/$/, "");

      const res = await fetch(`${base}/api/categories`, {
        headers: { Authorization: `Bearer ${cfg.token}` },

      });

      const text = await res.text();

      let data = null;



      try {


        data = text ? JSON.parse(text) : null;


      } catch {


        data = null;


      }



      if (!res.ok) {
        sendResponse({
          ok: false,
          httpStatus: res.status,

          categories: [],

          error: data?.error || `HTTP ${res.status}`,

        });
        return;



      }



      sendResponse({
        ok: true,

        categories: Array.isArray(data?.categories)
          ? data.categories
          : [],
      });


    } catch (e) {
      sendResponse({
        ok: false,
        categories: [],

        error: e?.message || String(e),
      });
    }



  })();



  return true;


}

/** Only http(s) pages receive usable content scripts. */
function blockedPageUrl(url) {
  if (!url || typeof url !== "string") {
    return true;
  }

  const u = url.trim().toLowerCase();

  return !(u.startsWith("http://") || u.startsWith("https://"));
}

/** Prefer in-page top-right banner (handled by content.js); fallback to alert. */
function notifyTab(tabId, payload) {
  if (tabId == null) return;
  const msg =
    typeof payload === "string"
      ? {
          type: "MYVAULT_HOST_TOAST",
          title: "Myvault extension",
          detail: payload,
        }
      : { type: "MYVAULT_HOST_TOAST", ...payload };

  chrome.tabs.sendMessage(tabId, msg, { frameId: 0 }, () => {
    if (!chrome.runtime.lastError) return;
    const fb =
      typeof payload === "string"
        ? payload
        : [payload.title, payload.detail || payload.text].filter(Boolean).join("\n\n");
    fallbackPageAlert(tabId, fb || "Myvault");
  });
}

function fallbackPageAlert(tabId, text) {
  if (!chrome.scripting?.executeScript || tabId == null) return;
  chrome.scripting
    .executeScript({
      target: { tabId, frameIds: [0] },
      args: [text],
      func: (message) => {
        window.alert(message);
      },
    })
    .catch(() => {});
}

async function dispatchAutofill(tabId, tabUrl) {
  if (blockedPageUrl(tabUrl)) {
    notifyTab(tabId, {
      title: "This page isn’t supported",
      detail:
        "Use Myvault autofill only on normal http/https website tabs.",
    });
    return;
  }

  let frameIds;

  try {
    const frames = await chrome.webNavigation.getAllFrames({ tabId });
    frameIds = frames?.length ? frames.map((f) => f.frameId) : [0];
  } catch {
    frameIds = [0];
  }

  let anyDelivered = false;
  let filled = false;

  for (const frameId of frameIds) {
    const result = await new Promise((resolve) => {
      chrome.tabs.sendMessage(
        tabId,
        { type: "VAULT_AUTOFILL" },
        { frameId },
        (resp) => {
          if (chrome.runtime.lastError) {
            resolve({ delivered: false, resp: null });
            return;
          }

          resolve({ delivered: true, resp });
        }
      );
    });

    if (result.delivered) {
      anyDelivered = true;
      const resp = result.resp;

      if (resp?.filled) {
        filled = true;
        break;
      }

      if (resp?.aborted) {
        break;
      }
    }
  }

  if (!anyDelivered) {
    notifyTab(tabId, {
      title: "Can’t reach this page",
      detail:
        "Reload the tab (F5), then try again. If the login is in an iframe, click inside it first. Ensure Myvault is running, unlocked, and the extension token is set under Extension options.",
    });
  }
}

chrome.commands.onCommand.addListener((command) => {
  if (command !== "vault-autofill") {
    return;
  }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];

    if (!tab?.id) {
      return;
    }

    void dispatchAutofill(tab.id, tab.url || "");
  });
});

chrome.action.onClicked.addListener((tab) => {
  if (!tab?.id) {
    return;
  }

  void dispatchAutofill(tab.id, tab.url || "");
});

/* Dev: auto-reload unpacked extension when running `npm run ext:dev-reload` (see scripts/extension-live-reload.cjs). */
const EXT_DEV_RELOAD_URL =
  "http://127.0.0.1:37528/version";
const EXT_DEV_RELOAD_INTERVAL_MS = 2000;
let extDevReloadLastNonce = "";

function tickExtensionDevReload() {
  fetch(EXT_DEV_RELOAD_URL, { cache: "no-store" })
    .then((r) => {
      if (!r.ok) {
        return Promise.reject();
      }

      return r.text();
    })
    .then((text) => {
      const t = String(text || "").trim();

      if (!t) {
        return;
      }

      if (extDevReloadLastNonce === "") {
        extDevReloadLastNonce = t;

        return;
      }

      if (t !== extDevReloadLastNonce) {
        extDevReloadLastNonce = t;
        chrome.runtime.reload();
      }
    })
    .catch(() => {});
}

setInterval(tickExtensionDevReload, EXT_DEV_RELOAD_INTERVAL_MS);
