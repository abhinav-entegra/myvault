"use strict";

const fs = require("fs");

const path = require("path");

const {
  app,
  BrowserWindow,
  ipcMain,
  clipboard,
  Menu,
  Notification,
} = require("electron");

const { openDatabase } = require("./db");
const session = require("./session");
const { startLocalServer, getLocalPort } = require("./server");
const vault = require("./vault-logic");
const supabaseSync = require("./supabase-sync");

const winUninstallMail = require("./win-uninstall-mail");

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

/** Set when `electron-updater` wires in packaged builds (`maybeAutoUpdater`). */
let appUpdaterRef = null;

/** User declined downloading this remote version via UI — skip background prompts until cleared. */
const declinedUpdaterVersions = new Set();

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

/** Broadcast `{ kind }` payloads to renderer (Extension pane updates UI). */
function broadcastUpdaterEvent(ev) {
  BrowserWindow.getAllWindows().forEach((win) => {

    try {

      if (!win.isDestroyed()) {

        win.webContents.send("app:updater-event", ev);

      }

    } catch {


      //

    }

  });

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
    const normalizedRegMail =
      emailRaw && supabaseSync.isOrgEmail(emailRaw)
        ? supabaseSync.normalizeMail(emailRaw)
        : "";
    const r = await vault.createVault(masterPassword, normalizedRegMail || null);
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

  ipcMain.handle("vault:get-registration-mail", async () => {
    return vault.getRegistrationMail();
  });

  ipcMain.handle("vault:reset-from-recovery", async (_e, payload) => {
    touchActivity();
    const recoveryKey = typeof payload?.recoveryKey === "string" ? payload.recoveryKey : "";
    const newPassword = typeof payload?.newPassword === "string" ? payload.newPassword : "";
    const confirmPassword =
      typeof payload?.confirmPassword === "string" ? payload.confirmPassword : "";
    if (!newPassword || newPassword.length < 8) {
      throw new Error("New password must be at least 8 characters.");
    }
    if (newPassword !== confirmPassword) {
      throw new Error("New password confirmation does not match.");
    }
    try {
      const r = await vault.resetMasterPasswordFromRecovery(recoveryKey, newPassword);
      failedUnlockAttempts = 0;
      scheduleAutoLock();
      return r;
    } catch (err) {
      failedUnlockAttempts = (failedUnlockAttempts || 0) + 1;
      throw err;
    }
  });

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

  ipcMain.handle("app:is-packaged", () => app.isPackaged);

  ipcMain.handle("app:get-version", () => app.getVersion());

  ipcMain.handle("updater:check", async () => {

    //

    if (!app.isPackaged) {

      return {

        ok: true,

        packaged: false,

        currentVersion: app.getVersion(),

        isUpdateAvailable: false,

        updateInfo: null,

      };

    }

    if (!appUpdaterRef) {

      return {

        ok: false,

        error: "Updater not initialized",

        currentVersion: app.getVersion(),

        packaged: true,

      };

    }

    //

    try {

      const r = await appUpdaterRef.checkForUpdates();

      const ui = r && r.updateInfo ? r.updateInfo : null;

      const isUpdateAvailable = !!(

        r && r.isUpdateAvailable && ui && typeof ui.version === "string"

      );

      return {

        ok: true,

        packaged: true,

        currentVersion: app.getVersion(),

        isUpdateAvailable,

        updateInfo:

          ui && typeof ui.version === "string"

            ? {

                version: String(ui.version || ""),

                releaseName:

                  typeof ui.releaseName === "string" ? ui.releaseName : "",

                releaseDate: ui.releaseDate != null ? String(ui.releaseDate) : "",

              }

            : null,

      };

    } catch (e) {

      return {

        ok: false,

        error: String(e?.message ?? e ?? "?"),

        currentVersion: app.getVersion(),

        packaged: true,

      };

    }

  });

  ipcMain.handle("updater:download", async () => {

    if (!app.isPackaged || !appUpdaterRef) {

      return { ok: false, error: "Updates only in installed app" };

    }

    //

    try {

      await appUpdaterRef.downloadUpdate();

      return { ok: true };

    } catch (e) {

      return { ok: false, error: String(e?.message ?? e ?? "?") };

    }

  });

  ipcMain.handle("updater:quit-install", () => {

    if (!app.isPackaged || !appUpdaterRef) {

      return { ok: false };

    }

    setImmediate(() => {

      try {

        appUpdaterRef.quitAndInstall(false, true);

      } catch {


        //

      }

    });

    return { ok: true };

  });

  ipcMain.handle("updater:decline-version", (_e, version) => {

    const v = String(version || "").trim();

    if (v) {

      declinedUpdaterVersions.add(v);

    }

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

function updaterLogLine(...parts) {
  try {
    const dir = app.getPath("userData");

    const line = `[${new Date().toISOString()}] ${parts.map(String).join(" ")}\n`;

    fs.appendFileSync(path.join(dir, "updater.log"), line);

  } catch {
    //
  }
}

/** Optional toast so updates are visibly announced (Windows prefers setAppUserModelId). */
function showUpdaterToast(title, body) {
  try {
    if (!Notification.isSupported()) {
      return;
    }
    const n = new Notification({
      title: title || "Myvault",
      body,
    });
    n.show();
  } catch {
    //
  }
}

/** GitHub `/releases/latest` follows the GitHub “Latest” flag; keep the highest semver tagged release as Latest or feeds can look stale. */
function maybeAutoUpdater() {
  try {
    //

    if (!app.isPackaged) {
      //

      return;
    }

    const { autoUpdater } = require("electron-updater");

    appUpdaterRef = autoUpdater;

    //

    autoUpdater.allowPrerelease = false;

    autoUpdater.autoDownload = false;

    autoUpdater.autoInstallOnAppQuit = true;

    updaterLogLine(`start check app=${String(app.getVersion())}`);

    //

    autoUpdater.on("checking-for-update", () => {
      updaterLogLine("checking-for-update");

      broadcastUpdaterEvent({ kind: "checking", currentVersion: app.getVersion() });
    });

    autoUpdater.on("update-available", (info) => {
      const v = typeof info?.version === "string" ? info.version : "?";

      updaterLogLine("update-available", v, info?.releaseName ?? "");

      if (declinedUpdaterVersions.has(v)) {
        updaterLogLine("skipped broadcast — download declined earlier", v);

        return;
      }

      showUpdaterToast(

        `Update available (${v})`,

        "Open Extension → App updates to download and install."

      );

      broadcastUpdaterEvent({
        kind: "available",

        currentVersion: app.getVersion(),

        version: v,

        releaseName: typeof info?.releaseName === "string" ? info.releaseName : "",

        releaseDate: info?.releaseDate != null ? String(info.releaseDate) : "",
      });

    });

    autoUpdater.on("update-not-available", (info) => {

      const remoteVer = typeof info?.version === "string" ? info.version : "";

      updaterLogLine(
        "update-not-available",

        remoteVer ? `remote=${remoteVer}` : ""

      );

      broadcastUpdaterEvent({
        kind: "none",

        currentVersion: app.getVersion(),

        remoteVersion: remoteVer,
      });

    });

    autoUpdater.on("download-progress", (p) => {

      const pct = Math.round(Number(p.percent) || 0);

      updaterLogLine(`download ${pct}%`);

      broadcastUpdaterEvent({ kind: "progress", percent: pct });

    });

    autoUpdater.on("update-downloaded", (info) => {

      const v = typeof info?.version === "string" ? info.version : "?";

      updaterLogLine("update-downloaded", v);

      showUpdaterToast("Ready to install", `Use Extension → App updates → Restart.`);

      broadcastUpdaterEvent({
        kind: "downloaded",

        version: v,
      });

    });

    autoUpdater.on("error", (err) => {

      const msg = String(err?.message ?? err ?? "");

      updaterLogLine(`error ${msg}`);

      broadcastUpdaterEvent({ kind: "error", message: msg });

    });

    void autoUpdater.checkForUpdates().catch((e) => {

      updaterLogLine(`checkForUpdates fatal ${String(e?.message ?? e ?? "?")}`);

    });

    const recheckMs = 4 * 60 * 60 * 1000;

    const intervalId = setInterval(() => {

      //

      try {

        autoUpdater.checkForUpdates().catch((e) => {

          updaterLogLine(`interval check error ${String(e?.message ?? e ?? "?")}`);

        });

      } catch (e) {

        updaterLogLine(`interval check outer ${String(e?.message ?? e ?? "?")}`);

      }

    }, recheckMs);

    app.once("quit", () => clearInterval(intervalId));

    //

  } catch (e) {
    updaterLogLine(`maybeAutoUpdater catch ${String(e?.message ?? e ?? "?")}`);
  }

}

app.whenReady().then(async () => {


  //

  try {

    if (process.platform === "win32") {

      app.setAppUserModelId("com.passapp.vault");

    }


  } catch {


    //

  }

  //

  Menu.setApplicationMenu(null);

  //

  await openDatabase(app.getPath("userData"));

  const uninstallPurge =
    app.isPackaged &&
    process.argv.some((a) => {

      try {

        return String(a).replace(/^["']+|["']+$/g, "").trim() === "--uninstall-purge-cloud";

      } catch {



        //

        return false;

      }

    });

  //

  if (uninstallPurge) {

    try {

      let mail = "";

      if (await vault.hasVault()) {

        mail = await vault.getRegistrationMail();

      }

      if (!mail && process.platform === "win32") {

        mail =
          winUninstallMail.readRegMailForUninstall() ||
          winUninstallMail.readFileFallbackMail();

      }

      let clearMirrorSafe = false;

      if (!mail || !supabaseSync.isConfigured()) {

        clearMirrorSafe = true;

      } else {

        await supabaseSync.deleteVaultCloudRow(mail);

        clearMirrorSafe = true;

      }

      if (process.platform === "win32" && clearMirrorSafe) {

        try {

          winUninstallMail.clearRegMailBackup();

        } catch {

          //

        }

      }

    } catch (e) {

      try {

        updaterLogLine(
          `uninstall-purge ${String(e?.message ?? e ?? "?")}`
        );

        fs.appendFileSync(

          path.join(app.getPath("userData"), "uninstall-purge.log"),

          `[${new Date().toISOString()}] ${String(e?.message ?? e ?? "?")}\n`

        );

      } catch {


        //

      }

    }

    app.quit();

    return;

  }

  startLocalServer(API_PORT);


  //

  maybeAutoUpdater();


  //

  registerIpc();


  //

  createWindow();


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
