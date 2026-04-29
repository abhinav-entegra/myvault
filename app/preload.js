"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("vaultApi", {
  hasVault: () => ipcRenderer.invoke("vault:has-vault"),
  getSupabaseRegistration: () =>
    ipcRenderer.invoke("app:supabase-registration"),
  createVault: (payload) => ipcRenderer.invoke("vault:create", payload),
  unlock: async (masterPassword) => {
    try {
      return await ipcRenderer.invoke("vault:unlock", masterPassword);
    } catch (e) {
      const combined = [
        e?.message,
        typeof e?.cause?.message === "string" ? e.cause.message : "",
      ]
        .filter(Boolean)
        .join(" ");
      if (/Invalid master password/i.test(combined)) {
        throw new Error("Invalid password");
      }
      throw e;
    }
  },
  lock: () => ipcRenderer.invoke("vault:lock"),
  vaultIsUnlocked: () => ipcRenderer.invoke("vault:is-unlocked"),
  setMainAlwaysOnTop: (flag) => ipcRenderer.invoke("window:set-main-always-on-top", flag),
  listCategories: () => ipcRenderer.invoke("vault:list-categories"),
  addCategory: (name) => ipcRenderer.invoke("vault:add-category", name),
  deleteCategory: (id) =>
    ipcRenderer.invoke("vault:delete-category", id),
  list: () => ipcRenderer.invoke("vault:list-items"),
  add: (payload) => ipcRenderer.invoke("vault:add", payload),
  update: (id, payload) => ipcRenderer.invoke("vault:update", id, payload),
  delete: (id) => ipcRenderer.invoke("vault:delete", id),
  getExtensionToken: () => ipcRenderer.invoke("vault:get-extension-token"),
  regenerateExtensionToken: () =>
    ipcRenderer.invoke("vault:regenerate-extension-token"),
  getApiBaseUrl: () => ipcRenderer.invoke("app:get-api-base-url"),
  pingActivity: () => ipcRenderer.invoke("app:ping-activity"),
  copyToClipboard: (text, clearAfterMs) =>
    ipcRenderer.invoke("clipboard:write-text", text, clearAfterMs),
  onSessionLocked: (cb) => {
    const fn = () => cb();
    ipcRenderer.on("vault:session-locked", fn);
    return () => ipcRenderer.removeListener("vault:session-locked", fn);
  },
  onNotesChanged: (cb) => {
    const fn = (_e, payload) => cb(payload);
    ipcRenderer.on("notes:changed", fn);
    return () => ipcRenderer.removeListener("notes:changed", fn);
  },
  listNoteFolders: () => ipcRenderer.invoke("notes:list-folders"),
  addNoteFolder: (name) => ipcRenderer.invoke("notes:add-folder", name),
  deleteNoteFolder: (id) => ipcRenderer.invoke("notes:delete-folder", id),
  listNotes: () => ipcRenderer.invoke("notes:list"),
  addNote: (payload) => ipcRenderer.invoke("notes:add", payload),
  updateNote: (id, payload) => ipcRenderer.invoke("notes:update", id, payload),
  deleteNote: (id) => ipcRenderer.invoke("notes:delete", id),
  openNoteFloatWindow: (noteId) => ipcRenderer.invoke("notes:open-float-window", noteId),
  closeNoteFloatWindow: () => ipcRenderer.invoke("notes:close-float-window"),
  /** Frameless-window controls (see main BrowserWindow frame: false) */
  winMinimize: () => ipcRenderer.invoke("window:platform-action", "minimize"),
  winToggleMaximize: () => ipcRenderer.invoke("window:platform-action", "toggle-maximize"),
  winClose: () => ipcRenderer.invoke("window:platform-action", "close"),
  winMaximizedFetch: () => ipcRenderer.invoke("window:is-maximized-query"),
  winOnMaximizedChanged: (cb) => {
    const fn = (_evt, maximized) => cb(maximized === true);
    ipcRenderer.on("window:maximized-state", fn);
    return () => ipcRenderer.removeListener("window:maximized-state", fn);
  },
});
