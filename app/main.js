"use strict";

const fs = require("fs");

const path = require("path");

const { app, BrowserWindow, ipcMain, clipboard, Menu } = require("electron");

const { openDatabase } = require("./db");
const session = require("./session");
const { startLocalServer, getLocalPort } = require("./server");
const vault = require("./vault-logic");
const supabaseSync = require("./supabase-sync");

const API_PORT = parseInt(process.env.PASSAPP_API_PORT || "58491", 10);

const LOCK_TIMEOUT_MS = 15 * 60 * 1000;

/** Max delay before evaluating unlock attempt after failures (milliseconds) */

const UNLOCK_DELAY_CAP_MS = 30_000;

const APP_ICON_PATH = path.join(__dirname, "icon.png");

function resolveAppIcon() {
  try {
    if (fs.existsSync(APP_ICON_PATH)) {
      return APP_ICON_PATH;

    }

  } catch {



    //

  }



  return undefined;

}

/** Forward maximized/restored state to renderer (custom frame). */
function wireWindowSignals(win) {
  const relay = () => {
    try {
      if (!win.isDestroyed()) {

        win.webContents.send("window:maximized-state", win.isMaximized());

      }

    } catch {



      //

    }

  };



  win.on("maximize", relay);

  win.on("unmaximize", relay);


}

let mainWindow = null;

let floatNoteWin = null;

let lockTimer = null;

let failedUnlockAttempts = 0;

function broadcastSessionLocked() {

  if (floatNoteWin && !floatNoteWin.isDestroyed()) {

    floatNoteWin.destroy();

    floatNoteWin = null;

  }

  BrowserWindow.getAllWindows().forEach((win) => {

    if (!win.isDestroyed()) win.webContents.send("vault:session-locked");

  });

}

function notifyLocked() {

  broadcastSessionLocked();

}

function broadcastNotesChanged(payload) {

  try {

    BrowserWindow.getAllWindows().forEach((win) => {

      if (!win.isDestroyed()) win.webContents.send("notes:changed", payload);

    });

  } catch {



    //

  }

}

function clearLockTimer() {
  if (lockTimer) {
    clearTimeout(lockTimer);

    lockTimer = null;

  }

}

function scheduleAutoLock() {
  clearLockTimer();

  lockTimer = setTimeout(() => {
    vault.lockVault();

    notifyLocked();

  }, LOCK_TIMEOUT_MS);

}

function touchActivity() {
  if (!vaultNeedsActivityCheck()) {

    return;

  }

  scheduleAutoLock();

}

function vaultNeedsActivityCheck() {
  return session.isUnlocked();

}

function createWindow() {
  const icon = resolveAppIcon();

  const win = new BrowserWindow({
    width: 1040,

    height: 760,

    minWidth: 800,

    minHeight: 560,

    show: false,

    frame: false,

    title: "Myvault",

    icon: icon || undefined,

    webPreferences: {
      preload: path.join(__dirname, "preload.js"),

      contextIsolation: true,

      nodeIntegration: false,

      sandbox: false,

    },

  });

  wireWindowSignals(win);

  win.once("ready-to-show", () => win.show());

  const useViteDev =
    !app.isPackaged && process.env.NODE_ENV === "development";

  if (useViteDev) {
    win.loadURL("http://127.0.0.1:5173");

    win.webContents.openDevTools({ mode: "detach" });

  } else {

    win.loadFile(

      path.join(__dirname, "..", "renderer-dist", "index.html")

    );

  }

  win.webContents.on("before-input-event", () => touchActivity());

  win.on("focus", () => touchActivity());

  mainWindow = win;

  return win;

}

async function delayUnlockBackoff() {
  if (failedUnlockAttempts <= 0) {
    return;

  }

  const exp = Math.min(8, failedUnlockAttempts - 1);

  const ms = Math.min(UNLOCK_DELAY_CAP_MS, 1000 * 2 ** exp);

  await new Promise((r) => {

    setTimeout(r, ms);

  });

}

function registerIpc() {
  ipcMain.handle("window:platform-action", (e, action) => {
    const win = BrowserWindow.fromWebContents(e.sender);

    if (!win || win.isDestroyed()) {

      return { ok: false };

    }

    const a = String(action || "");

    if (a === "minimize") {

      win.minimize();

      return { ok: true };

    }

    if (a === "toggle-maximize") {

      if (win.isMaximized()) {

        win.unmaximize();

      } else {

        win.maximize();

      }

      return { ok: true, maximized: win.isMaximized() };

    }

    if (a === "close") {

      win.close();

      return { ok: true };

    }

    return { ok: false };

  });

  ipcMain.handle("window:is-maximized-query", (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);

    if (!win || win.isDestroyed()) {

      return { maximized: false };

    }

    return { maximized: win.isMaximized() };

  });

  ipcMain.handle("vault:has-vault", () => vault.hasVault());

  ipcMain.handle("vault:create", async (_e, payload) => {
    touchActivity();
    const masterPassword =
      typeof payload === "string"
        ? payload
        : String(payload?.masterPassword ?? "");
    const emailRaw =
      typeof payload === "object" && payload !== null
        ? String(payload.email ?? payload.mail ?? "").trim()
        : "";
    if (supabaseSync.isConfigured()) {
      if (!supabaseSync.isOrgEmail(emailRaw)) {
        throw new Error(
          `Provide a valid work email ending in ${supabaseSync.ORG_SUFFIX}`
        );
      }
    }
    const r = await vault.createVault(masterPassword);
    scheduleAutoLock();
    let supabaseSynced = false;
    let supabaseError = null;
    try {
      const sync = await supabaseSync.registerVaultCredentials({
        mail: emailRaw,
        plainMasterPassword: masterPassword,
      });
      if (sync && sync.ok) {
        supabaseSynced = true;
      }
    } catch (e) {
      supabaseError = e?.message || String(e);
    }
    return {
      ...r,
      supabaseSynced,
      supabaseError,
    };
  });

  ipcMain.handle("vault:unlock", async (_e, masterPassword) => {
    await delayUnlockBackoff();
    try {
      const r = await vault.unlockVault(masterPassword);
      failedUnlockAttempts = 0;
      scheduleAutoLock();
      return r;
    } catch (err) {
      failedUnlockAttempts += 1;
      throw err;
    }
  });

  ipcMain.handle("vault:list-categories", () => vault.listCategories());

  ipcMain.handle("vault:add-category", (_e, rawName) =>
    vault.addCategory(rawName)
  );

  ipcMain.handle("vault:delete-category", (_e, id) =>
    vault.deleteCategory(id)
  );

  ipcMain.handle("vault:lock", () => {
    vault.lockVault();

    clearLockTimer();

    failedUnlockAttempts = 0;

    broadcastSessionLocked();

    return { ok: true };

  });

  ipcMain.handle("vault:is-unlocked", () => session.isUnlocked());

  ipcMain.handle("window:set-main-always-on-top", (_e, flag) => {

    try {

      if (mainWindow && !mainWindow.isDestroyed()) {

        mainWindow.setAlwaysOnTop(flag === true);

      }

    } catch {



      //

    }

    return { ok: true };

  });

  ipcMain.handle("notes:open-float-window", (_e, noteId) => {
    touchActivity();

    if (!mainWindow || mainWindow.isDestroyed()) {

      return { ok: false };

    }

    try {

      if (floatNoteWin && !floatNoteWin.isDestroyed()) {

        floatNoteWin.focus();

        return { ok: true };

      }

      floatNoteWin = new BrowserWindow({
        width: 400,

        height: 540,

        minWidth: 96,

        minHeight: 120,

        parent: mainWindow,

        alwaysOnTop: true,

        show: false,

        frame: false,

        title: "Vault note",

        icon: resolveAppIcon() || undefined,

        webPreferences: {

          preload: path.join(__dirname, "preload.js"),

          contextIsolation: true,

          nodeIntegration: false,

          sandbox: false,

        },

      });

      wireWindowSignals(floatNoteWin);

      floatNoteWin.once("ready-to-show", () => floatNoteWin.show());

      floatNoteWin.on("closed", () => {

        floatNoteWin = null;

      });

      const useViteDev =
        !app.isPackaged && process.env.NODE_ENV === "development";

      if (useViteDev) {

        floatNoteWin.loadURL(

          `http://127.0.0.1:5173/?noteFloat=${encodeURIComponent(String(noteId))}`

        );

      } else {

        floatNoteWin.loadFile(

          path.join(__dirname, "..", "renderer-dist", "index.html"),

          { query: { noteFloat: String(noteId) } }

        );

      }

      return { ok: true };

    } catch {



      return { ok: false };

    }

  });

  ipcMain.handle("notes:close-float-window", () => {

    try {

      if (floatNoteWin && !floatNoteWin.isDestroyed()) {

        floatNoteWin.close();

      }

      floatNoteWin = null;

    } catch {



      //

    }

    return { ok: true };

  });

  ipcMain.handle("vault:list-items", () => vault.listCredentials());

  ipcMain.handle(
    "vault:add",

    (_e, payload) => {

      touchActivity();

      return vault.addCredential(payload);

    }

  );

  ipcMain.handle(
    "vault:update",

    (_e, id, payload) => {

      touchActivity();

      return vault.updateCredential(id, payload);

    }

  );

  ipcMain.handle(
    "vault:delete",

    (_e, id) => {

      touchActivity();

      return vault.deleteCredential(id);

    }

  );

  ipcMain.handle("vault:get-extension-token", () => vault.getExtensionToken());

  ipcMain.handle("vault:regenerate-extension-token", () => {
    touchActivity();

    return vault.regenerateExtensionToken();

  });

  ipcMain.handle("app:get-api-base-url", () => {
    const p = getLocalPort() || API_PORT;

    return `http://127.0.0.1:${p}`;

  });

  ipcMain.handle("app:supabase-registration", () => ({
    configured: supabaseSync.isConfigured(),
    orgSuffix: supabaseSync.ORG_SUFFIX,
  }));

  ipcMain.handle("clipboard:write-text", (_e, text, clearAfterMs) => {
    touchActivity();

    const t = String(text || "");

    clipboard.writeText(t);

    const ms =

      typeof clearAfterMs === "number" && clearAfterMs > 0

        ? clearAfterMs

        : 30_000;

    setTimeout(() => {
      try {
        if (clipboard.readText() === t) {

          clipboard.clear();

        }

      } catch {



        //

      }

    }, ms);

    return { ok: true };

  });

  ipcMain.handle("app:ping-activity", () => {
    touchActivity();

    return { ok: true };

  });

  ipcMain.handle("notes:list-folders", () => vault.listNoteFolders());

  ipcMain.handle("notes:add-folder", (_e, name) => {
    touchActivity();
    return vault.addNoteFolder(name);
  });

  ipcMain.handle("notes:delete-folder", (_e, id) => {
    touchActivity();
    return vault.deleteNoteFolder(id);
  });

  ipcMain.handle("notes:list", () => vault.listVaultNotes());

  ipcMain.handle("notes:add", async (_e, payload) => {
    touchActivity();
    const r = await vault.addVaultNote(payload || {});
    broadcastNotesChanged({
      kind: "upsert",
      noteId: r.id,
      updatedAt: r.updatedAt,
    });
    return r;
  });

  ipcMain.handle("notes:update", async (_e, id, payload) => {
    touchActivity();
    const r = await vault.updateVaultNote(id, payload || {});
    broadcastNotesChanged({
      kind: "upsert",
      noteId: r.id,
      updatedAt: r.updatedAt,
    });
    return r;
  });

  ipcMain.handle("notes:delete", async (_e, id) => {
    touchActivity();
    const r = await vault.deleteVaultNote(id);
    broadcastNotesChanged({ kind: "delete", noteId: r.id });
    return r;
  });

}

function maybeAutoUpdater() {
  try {

    //

    if (app.isPackaged) {

      const { autoUpdater } = require("electron-updater");

      autoUpdater.checkForUpdatesAndNotify();

    }

  } catch {



    //

  }

}

app.whenReady().then(async () => {


  //

  Menu.setApplicationMenu(null);

  //

  await openDatabase(app.getPath("userData"));

  startLocalServer(API_PORT);


  //

  registerIpc();


  //

  createWindow();


  //

  maybeAutoUpdater();


});

app.on("window-all-closed", () => {
  vault.lockVault();

  if (process.platform !== "darwin") {
    app.quit();

  }

});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();

  }

});
