import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const api = typeof window !== "undefined" ? window.vaultApi : undefined;

/** Sidebar + tab: `renderer/public/logo-mark.png` (sync to `app/icon.png` via npm run sync-brand-icon). */
const BRAND_LOGO_SRC = `${import.meta.env.BASE_URL}logo-mark.png`;

function maskToken(t) {
  if (!t || typeof t !== "string") return "—";
  return `${t.slice(0, 8)}…${t.slice(-4)}`;
}

function hostFromUrl(u) {
  if (!u || typeof u !== "string") return "";
  try {
    const h = new URL(u.includes("://") ? u : `https://${u}`).hostname;
    return h.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

function truncateNote(s, maxLen) {
  const t = (s || "").trim();
  if (!t) return "";
  return t.length > maxLen ? `${t.slice(0, maxLen)}…` : t;
}

/** Labels electron-updater ISO release timestamps from feed / IPC. */
function formatUpdaterDate(isoOrStr) {
  if (!isoOrStr || typeof isoOrStr !== "string") return "";
  try {
    const d = new Date(isoOrStr);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "";
  }
}

function generatePassword(len = 20) {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const num = "23456789";
  const sym = "!@#$%&*-_=+";
  const all = upper + lower + num + sym;
  const out = [];
  out.push(upper[Math.floor(Math.random() * upper.length)]);
  out.push(lower[Math.floor(Math.random() * lower.length)]);
  out.push(num[Math.floor(Math.random() * num.length)]);
  out.push(sym[Math.floor(Math.random() * sym.length)]);
  for (let i = out.length; i < len; i++) {
    out.push(all[Math.floor(Math.random() * all.length)]);
  }
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.join("");
}

const NOTE_LINE_PX = 26;
const NOTE_CARD_LINE_PX = 20;
/** Frequent autosave (~20 keystrokes/sec still batches); Ctrl/Cmd+S always flushes */
const NOTE_AUTOSAVE_MS = 48;
const NOTE_PALETTE = [
  { tint: "#fffdf8", line: "rgba(15, 23, 42, 0.07)" },
  { tint: "#f4fcf7", line: "rgba(15, 23, 42, 0.06)" },
  { tint: "#f5f8ff", line: "rgba(15, 23, 42, 0.07)" },
  { tint: "#faf8ff", line: "rgba(15, 23, 42, 0.06)" },
];

function noteCardSurfaceStyle(colorIdx) {
  const i = Math.min(3, Math.max(0, colorIdx || 0));
  const { tint, line } = NOTE_PALETTE[i];
  const lh = NOTE_CARD_LINE_PX;
  return {
    backgroundColor: tint,
    backgroundImage: `repeating-linear-gradient(transparent, transparent ${lh - 1}px, ${line} ${lh - 1}px, ${line} ${lh}px)`,
    backgroundSize: `100% ${lh}px`,
  };
}

function parseNoteFloatId() {
  try {
    const v = new URLSearchParams(window.location.search).get("noteFloat");
    if (v === null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** macOS/Win11-style window controls — 12×12, rounded stroke caps */
function IconTitleMinimize() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden className="shrink-0">
      <path d="M2.5 6h7" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
    </svg>
  );
}

function IconTitleMaximize() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden className="shrink-0">
      <rect x="2" y="2" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}

function IconTitleRestore() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden className="shrink-0">
      <rect x="3.5" y="3.5" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M2.5 5.5V3.5C2.5 2.95 2.95 2.5 3.5 2.5H5.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconTitleClose() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden className="shrink-0">
      <path d="M3 3l6 6M9 3L3 9" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconVisibilityOpen() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
      <path
        d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconVisibilityClosed() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
      <path
        d="M17.94 17.94A10.06 10.06 0 0 1 12 19c-7 0-11-8-11-8a21.71 21.71 0 0 1 5.06-7.94M9.9 4.24A10.06 10.06 0 0 1 12 5c7 0 11 8 11 8a21.71 21.71 0 0 1-2.16 3.13m-2.95 2.95L12 15"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="m1 1 22 22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ChromeTitleBar({ subtitle, title = "Myvault" }) {
  const [maximized, setMaximized] = useState(false);
  const can = typeof api?.winMinimize === "function";

  useEffect(() => {
    if (!can || typeof api?.winMaximizedFetch !== "function") return undefined;
    let off = () => {};
    void (async () => {
      try {
        const r = await api.winMaximizedFetch();
        if (r && typeof r.maximized === "boolean") setMaximized(r.maximized);
      } catch {
        //
      }
    })();
    if (typeof api.winOnMaximizedChanged === "function") {
      off = api.winOnMaximizedChanged((v) => setMaximized(v));
    }
    return off;
  }, [can]);

  if (!can) return null;

  return (
    <header className="flex h-11 shrink-0 items-stretch bg-gradient-to-br from-[#f5f5f7] via-white to-[#eef3ff]">
      <div
        className="flex min-w-0 flex-1 items-center px-3 py-1"
        style={{ WebkitAppRegion: "drag" }}
        onDoubleClick={() => void api.winToggleMaximize?.()}
      >
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold leading-tight tracking-tight text-vault-text">
            {title}
          </div>
          {subtitle ? (
            <div className="truncate text-[11px] leading-tight text-vault-muted">{subtitle}</div>
          ) : null}
        </div>
      </div>
      <div
        className="flex items-center gap-1 py-2 pr-2 pl-1"
        style={{ WebkitAppRegion: "no-drag" }}
      >
        <button
          type="button"
          title="Minimize"
          aria-label="Minimize"
          onClick={() => void api.winMinimize?.()}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#5c5c60] transition-colors hover:bg-black/[0.06] hover:text-vault-text active:scale-[0.96]"
        >
          <IconTitleMinimize />
        </button>
        <button
          type="button"
          title={maximized ? "Restore" : "Maximize"}
          aria-label={maximized ? "Restore" : "Maximize"}
          onClick={() => void api.winToggleMaximize?.()}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#5c5c60] transition-colors hover:bg-black/[0.06] hover:text-vault-text active:scale-[0.96]"
        >
          {maximized ? <IconTitleRestore /> : <IconTitleMaximize />}
        </button>
        <button
          type="button"
          title="Close"
          aria-label="Close"
          onClick={() => void api.winClose?.()}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#5c5c60] transition-colors hover:bg-[#e03636] hover:text-white active:scale-[0.96]"
        >
          <IconTitleClose />
        </button>
      </div>
    </header>
  );
}

function WindowShell({ children, subtitle, title }) {
  const show = typeof api?.winMinimize === "function";
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {show ? <ChromeTitleBar subtitle={subtitle} title={title} /> : null}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}

function GlassUpdaterAvailableModal({ version, releaseName, releaseDateLabel, onUpdate, onDecline }) {
  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center p-5 sm:p-8">
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-md"
        aria-label="Dismiss update dialog"
        onClick={onDecline}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-[420px] rounded-[22px] border border-white/35 bg-white/[0.72] p-8 shadow-[0_32px_120px_rgba(0,0,0,0.18)] backdrop-blur-xl"
      >
        <div className="text-[11px] font-semibold uppercase tracking-wide text-vault-muted">New release</div>
        <h2 className="mt-2 text-lg font-semibold tracking-tight text-vault-text">Update available</h2>
        <p className="mt-4 text-sm leading-relaxed text-vault-muted">
          <span className="font-medium text-vault-text">{version}</span>
          {releaseName ? <> · {releaseName}</> : null}
        </p>
        {releaseDateLabel ? (
          <p className="mt-3 text-[12px] text-vault-muted">Published {releaseDateLabel}</p>
        ) : null}
        <div className="mt-8 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            className="rounded-xl px-5 py-2.5 text-sm font-medium text-vault-muted transition hover:bg-black/[0.05]"
            onClick={onDecline}
          >
            Decline
          </button>
          <button
            type="button"
            className="rounded-xl bg-apple-blue px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-apple-blue/20 transition hover:bg-[#0066d6]"
            onClick={onUpdate}
          >
            Update
          </button>
        </div>
      </div>
    </div>
  );
}

function GlassUpdaterReadyModal({ version, onRestart, onLater }) {
  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center p-5 sm:p-8">
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-md"
        aria-label="Dismiss"
        onClick={onLater}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-[420px] rounded-[22px] border border-white/35 bg-white/[0.72] p-8 shadow-[0_32px_120px_rgba(0,0,0,0.18)] backdrop-blur-xl"
      >
        <div className="text-[11px] font-semibold uppercase tracking-wide text-vault-muted">Ready</div>
        <h2 className="mt-2 text-lg font-semibold tracking-tight text-vault-text">Restart to finish</h2>
        <p className="mt-4 text-sm leading-relaxed text-vault-muted">
          Version <span className="font-medium text-vault-text">{version}</span> is downloaded.
          Restart the app to switch to this version now.
        </p>
        <div className="mt-8 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            className="rounded-xl px-5 py-2.5 text-sm font-medium text-vault-muted transition hover:bg-black/[0.05]"
            onClick={onLater}
          >
            Later
          </button>
          <button
            type="button"
            className="rounded-xl bg-apple-blue px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-apple-blue/20 transition hover:bg-[#0066d6]"
            onClick={onRestart}
          >
            Restart now
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [bootError, setBootError] = useState(null);
  const [checking, setChecking] = useState(true);
  const [vaultExists, setVaultExists] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [mp, setMp] = useState("");
  const [confirmMp, setConfirmMp] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [supabaseRegistration, setSupabaseRegistration] = useState({
    configured: false,
    orgSuffix: "",
  });
  const [showUnlockPw, setShowUnlockPw] = useState(false);
  const [showCreateMp, setShowCreateMp] = useState(false);
  const [showConfirmMpVis, setShowConfirmMpVis] = useState(false);
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [unlockRejectedBadPw, setUnlockRejectedBadPw] = useState(false);
  const [recoverModalOpen, setRecoverModalOpen] = useState(false);
  const [recoveryKeyPlain, setRecoveryKeyPlain] = useState("");
  const [recoveryNewPw, setRecoveryNewPw] = useState("");
  const [recoveryConfirmPw, setRecoveryConfirmPw] = useState("");
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryError, setRecoveryError] = useState(null);
  const [categories, setCategories] = useState([]);
  const [categoryFilter, setCategoryFilter] = useState(null);
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [pane, setPane] = useState("items");
  const [revealedPw, setRevealedPw] = useState(false);
  const [credModal, setCredModal] = useState(null);
  const [categoryModal, setCategoryModal] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [detailCred, setDetailCred] = useState(null);
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  const [noteFolders, setNoteFolders] = useState([]);
  const [notes, setNotes] = useState([]);
  const [noteFolderFilter, setNoteFolderFilter] = useState(null);
  const [noteSearch, setNoteSearch] = useState("");
  const [noteFolderModal, setNoteFolderModal] = useState(false);
  const [newNoteFolderName, setNewNoteFolderName] = useState("");
  const [noteNameModal, setNoteNameModal] = useState(false);
  const [newNoteTitleInput, setNewNoteTitleInput] = useState("");
  const [noteEditorNote, setNoteEditorNote] = useState(null);
  /** { role: 'cred'|'note', id, title, subtitle? } */
  const [pendingDelete, setPendingDelete] = useState(null);
  const [floatNoteSync, setFloatNoteSync] = useState(0);
  const [vaultPinnedFront, setVaultPinnedFront] = useState(false);
  const [updaterPackaged, setUpdaterPackaged] = useState(null);
  const [installedAppVersion, setInstalledAppVersion] = useState("");
  const [updaterLastCheckIso, setUpdaterLastCheckIso] = useState("");
  const [updaterOffer, setUpdaterOffer] = useState(null);
  const [updaterDownloadProgress, setUpdaterDownloadProgress] = useState(null);
  const [updaterDownloadedVersion, setUpdaterDownloadedVersion] = useState(null);
  const [updaterChecking, setUpdaterChecking] = useState(false);
  const [updaterModal, setUpdaterModal] = useState(null);
  const [updaterDlBusy, setUpdaterDlBusy] = useState(false);

  const setPinnedAndSync = useCallback((v) => {
    const next = !!v;
    setVaultPinnedFront(next);
    if (typeof api?.setMainAlwaysOnTop === "function") {
      void api.setMainAlwaysOnTop(next);
    }
  }, []);

  const showToast = useCallback((msg) => {
    setToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2000);
  }, []);

  const closeRecoveryModal = useCallback(() => {
    setRecoverModalOpen(false);
    setRecoveryKeyPlain("");
    setRecoveryNewPw("");
    setRecoveryConfirmPw("");
    setRecoveryError(null);
    setRecoveryBusy(false);
  }, []);

  const handleRecoveryConfirm = useCallback(async () => {
    if (typeof api?.resetMasterPasswordFromRecovery !== "function") {
      setRecoveryError("Recovery is not available in this build.");
      return;
    }
    setRecoveryError(null);
    if (!recoveryNewPw || recoveryNewPw.length < 8) {
      setRecoveryError("New password must be at least 8 characters.");
      return;
    }
    if (recoveryNewPw !== recoveryConfirmPw) {
      setRecoveryError("New password confirmation does not match.");
      return;
    }
    const k = recoveryKeyPlain.trim().replace(/\s+/g, "");
    if (!k || k.length < 16) {
      setRecoveryError("Enter your full encryption recovery key (from Supabase, column recovery_key).");
      return;
    }
    setRecoveryBusy(true);
    try {
      const res = await api.resetMasterPasswordFromRecovery({
        recoveryKey: recoveryKeyPlain.trim(),
        newPassword: recoveryNewPw,
        confirmPassword: recoveryConfirmPw,
      });
      closeRecoveryModal();
      setUnlockRejectedBadPw(false);
      setFormError(null);
      setMp("");
      setUnlocked(true);
      setCategoryFilter(null);
      setPane("items");
      if (res?.supabaseError) {
        showToast(`Vault updated locally. Cloud sync warning: ${res.supabaseError}`);
      } else {
        showToast("Password reset successfully.");
      }
    } catch (e) {
      setRecoveryError(String(e?.message || e).trim() || "Reset failed");
    } finally {
      setRecoveryBusy(false);
    }
  }, [
    recoveryKeyPlain,
    recoveryNewPw,
    recoveryConfirmPw,
    closeRecoveryModal,
    showToast,
  ]);

  const declineUpdaterPrompt = useCallback(async () => {
    const ver = updaterOffer?.version;
    if (
      typeof ver === "string" &&
      ver.length > 0 &&
      typeof api?.declineUpdaterVersion === "function"
    ) {
      await api.declineUpdaterVersion(ver);
    }
    setUpdaterModal(null);
  }, [updaterOffer]);

  const beginUpdaterDownload = useCallback(async () => {
    if (typeof api?.downloadAvailableUpdate !== "function") return;
    setUpdaterModal(null);
    setUpdaterDlBusy(true);
    setUpdaterDownloadProgress(0);
    try {
      const r = await api.downloadAvailableUpdate();
      if (!r?.ok) {
        showToast(String(r?.error || "Download failed").slice(0, 160));
        setUpdaterDownloadProgress(null);
      }
    } finally {
      setUpdaterDlBusy(false);
    }
  }, [showToast]);

  const checkUpdatesFromUi = useCallback(async () => {
    if (typeof api?.checkForUpdatesManual !== "function") {
      showToast("Updater is not available.");
      return;
    }
    setUpdaterChecking(true);
    try {
      const r = await api.checkForUpdatesManual();
      setUpdaterLastCheckIso(new Date().toISOString());
      if (!r?.ok) {
        showToast(String(r?.error ?? "Could not check for updates.").slice(0, 160));
        return;
      }
      if (r.packaged === false) {
        setUpdaterOffer(null);
        setUpdaterModal(null);
        showToast("Use the packaged app from GitHub Releases to receive updates.");
        return;
      }
      if (r.isUpdateAvailable && r.updateInfo && typeof r.updateInfo.version === "string") {
        setUpdaterOffer({
          version: r.updateInfo.version,
          releaseName:
            typeof r.updateInfo.releaseName === "string" ? r.updateInfo.releaseName : "",
          releaseDate:
            typeof r.updateInfo.releaseDate === "string" ? r.updateInfo.releaseDate : "",
        });
        setUpdaterModal("available");
      } else {
        setUpdaterOffer(null);
        setUpdaterModal(null);
        showToast("You're on the latest version.");
      }
    } finally {
      setUpdaterChecking(false);
    }
  }, [showToast]);

  const quitAndInstallFromUi = useCallback(() => {
    if (typeof api?.quitAndInstallUpdate !== "function") return;
    setUpdaterModal(null);
    void api.quitAndInstallUpdate();
  }, []);

  const dismissReadyUpdaterModal = useCallback(() => setUpdaterModal(null), []);

  const refreshCategories = useCallback(async () => {
    try {
      const rows = await api.listCategories();
      setCategories(rows || []);
    } catch {
      setCategories([]);
    }
  }, []);

  const refreshList = useCallback(async () => {
    const list = await api.list();
    setItems(list || []);
    return list;
  }, []);

  const refreshNoteFolders = useCallback(async () => {
    try {
      const rows = await api.listNoteFolders();
      setNoteFolders(rows || []);
    } catch {
      setNoteFolders([]);
    }
  }, []);

  const refreshNotes = useCallback(async () => {
    try {
      const list = await api.listNotes();
      setNotes(list || []);
    } catch {
      setNotes([]);
    }
  }, []);

  const noteFloatBootId = useMemo(() => parseNoteFloatId(), []);

  const handleNotesChanged = useCallback(
    async (p) => {
      try {
        await refreshNotes();
        if (!p) return;
        if (p.kind === "delete") {
          setNoteEditorNote((cur) => (cur?.id === p.noteId ? null : cur));
          return;
        }
        if (p.kind === "upsert") {
          if (noteFloatBootId != null && p.noteId === noteFloatBootId) {
            setFloatNoteSync((x) => x + 1);
          }
          const list = await api.listNotes();
          const n = list.find((x) => x.id === p.noteId);
          if (n) {
            setNoteEditorNote((cur) => (cur?.id === p.noteId ? { ...n } : cur));
          }
        }
      } catch {
        //
      }
    },
    [refreshNotes, noteFloatBootId]
  );

  useEffect(() => {
    if (!unlocked || typeof api?.onNotesChanged !== "function") return undefined;
    return api.onNotesChanged((payload) => {
      void handleNotesChanged(payload);
    });
  }, [unlocked, handleNotesChanged]);

  useEffect(() => {
    if (!unlocked || typeof api?.onUpdaterEvent !== "function") return undefined;
    return api.onUpdaterEvent((ev) => {
      if (!ev || typeof ev !== "object") return;
      if (ev.kind === "checking") return;
      if (ev.kind === "progress") {
        const pct = Number(ev.percent);
        if (Number.isFinite(pct)) {
          const n = Math.min(100, Math.max(0, Math.round(pct)));
          setUpdaterDownloadProgress(n);
        }
        return;
      }
      if (ev.kind === "available") {
        setUpdaterOffer({
          version: String(ev.version ?? ""),
          releaseName: typeof ev.releaseName === "string" ? ev.releaseName : "",
          releaseDate: typeof ev.releaseDate === "string" ? ev.releaseDate : "",
        });
        setUpdaterModal((prev) => (prev === "ready" ? "ready" : "available"));
        return;
      }
      if (ev.kind === "none") {
        return;
      }
      if (ev.kind === "downloaded") {
        const v = String(ev.version ?? "");
        setUpdaterDownloadedVersion(v.length > 0 ? v : null);
        setUpdaterDownloadProgress(null);
        setUpdaterModal("ready");
        return;
      }
      if (ev.kind === "error") {
        showToast(String(ev.message ?? "Update error").slice(0, 160));
      }
    });
  }, [unlocked, showToast]);

  useEffect(() => {
    async function probe() {
      try {
        const hv = await api.hasVault();
        setVaultExists(hv);
        setApiBaseUrl(await api.getApiBaseUrl());
        if (typeof api.isPackaged === "function") {
          try {
            setUpdaterPackaged(await api.isPackaged());
          } catch {
            setUpdaterPackaged(null);
          }
        }
        if (typeof api.getAppVersion === "function") {
          try {
            const v = await api.getAppVersion();
            if (typeof v === "string") setInstalledAppVersion(v);
          } catch {
            //
          }
        }
        if (typeof api.getSupabaseRegistration === "function") {
          try {
            const sr = await api.getSupabaseRegistration();
            setSupabaseRegistration({
              configured: !!sr?.configured,
              orgSuffix: sr?.orgSuffix ?? "",
            });
          } catch {
            //
          }
        }
        if (
          noteFloatBootId !== null &&
          typeof api.vaultIsUnlocked === "function" &&
          (await api.vaultIsUnlocked())
        ) {
          setUnlocked(true);
        }
      } catch (e) {
        setBootError(e.message || String(e));
      } finally {
        setChecking(false);
      }
    }
    probe();
  }, [noteFloatBootId]);

  useEffect(() => {
    return api.onSessionLocked(() => {
      setUnlocked(false);
      setUnlockRejectedBadPw(false);
      setItems([]);
      setCategories([]);
      setDetailCred(null);
      setCredModal(null);
      setMp("");
      setRevealedPw(false);
      setNoteFolders([]);
      setNotes([]);
      setNoteFolderFilter(null);
      setNoteSearch("");
      setNoteEditorNote(null);
      setNoteNameModal(false);
      setNoteFolderModal(false);
      setVaultPinnedFront(false);
      if (typeof api?.setMainAlwaysOnTop === "function") {
        void api.setMainAlwaysOnTop(false);
      }
    });
  }, []);

  useEffect(() => {
    async function load() {
      if (unlocked) {
        await refreshCategories();
        await refreshList();
        await refreshNoteFolders();
        await refreshNotes();
      }
    }
    load();
  }, [unlocked, refreshCategories, refreshList, refreshNoteFolders, refreshNotes]);

  const headerTitle = useMemo(() => {
    if (pane === "extension") return "Extension";
    if (pane === "notes") {
      if (noteFolderFilter != null) {
        const f = noteFolders.find((x) => x.id === noteFolderFilter);
        return f ? f.name : "Notes";
      }
      return "Notes";
    }
    if (pane === "favorites") return "Favorites";
    if (categoryFilter != null) {
      const c = categories.find((x) => x.id === categoryFilter);
      return c ? c.name : "Category";
    }
    return "All items";
  }, [pane, categoryFilter, categories, noteFolderFilter, noteFolders]);

  const notesFiltered = useMemo(() => {
    let list = [...notes];
    if (noteFolderFilter != null) {
      list = list.filter((n) => Number(n.folderId) === Number(noteFolderFilter));
    }
    const q = noteSearch.trim().toLowerCase();
    if (q) {
      list = list.filter((n) => {
        const blob = `${n.title || ""} ${n.body || ""}`.toLowerCase();
        return blob.includes(q);
      });
    }
    list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return list;
  }, [notes, noteFolderFilter, noteSearch]);

  /** Sidebar omits General; items still live in General via "All categories" & forms */
  const categoriesSidebar = useMemo(
    () => categories.filter((c) => String(c.name).toLowerCase() !== "general"),
    [categories]
  );

  const listFiltered = useMemo(() => {
    let list = [...items];
    if (pane === "items" && categoryFilter != null) {
      list = list.filter((i) => Number(i.categoryId) === Number(categoryFilter));
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((i) => {
        const blob = [
          i.url,
          i.username,
          i.title,
          i.notes,
          i.categoryName,
          hostFromUrl(i.url),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return blob.includes(q);
      });
    }
    list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return list;
  }, [items, categoryFilter, pane, search]);

  /** Favorites rail: starred passwords + starred notes only, merged by updated time */
  const favoritesDashboardRows = useMemo(() => {
    if (pane !== "favorites") return [];
    const q = search.trim().toLowerCase();
    let credRows = items.filter((i) => i.favorite);
    let noteRows = notes.filter((n) => n.favorite);
    if (q) {
      credRows = credRows.filter((i) => {
        const blob = [
          i.url,
          i.username,
          i.title,
          i.notes,
          i.categoryName,
          hostFromUrl(i.url),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return blob.includes(q);
      });
      noteRows = noteRows.filter((n) => {
        const blob = `${n.title || ""} ${n.body || ""} ${n.folderName || ""}`.toLowerCase();
        return blob.includes(q);
      });
    }
    const rows = [];
    credRows.forEach((entry) =>
      rows.push({ kind: "cred", ts: entry.updatedAt || 0, entry })
    );
    noteRows.forEach((n) => rows.push({ kind: "note", ts: n.updatedAt || 0, note: n }));
    rows.sort((a, b) => b.ts - a.ts);
    return rows;
  }, [pane, items, notes, search]);

  const handleUnlock = async () => {
    setFormError(null);
    setUnlockRejectedBadPw(false);
    setBusy(true);
    try {
      await api.unlock(mp);
      setMp("");
      setUnlockRejectedBadPw(false);
      setUnlocked(true);
      setCategoryFilter(null);
      setPane("items");
    } catch (e) {
      const msg = String(e?.message || e).trim();
      setFormError(msg || "Unlock failed");
      setUnlockRejectedBadPw(
        !!(
          supabaseRegistration.configured &&
          (msg === "Invalid password" || /invalid master password/i.test(msg))
        ),
      );
      setMp("");
    } finally {
      setBusy(false);
    }
  };

  const handleCreateVault = async () => {
    setFormError(null);
    const mail = accountEmail.trim();
    const suf = supabaseRegistration.orgSuffix.toLowerCase();
    const mLow = mail.toLowerCase();
    if (supabaseRegistration.configured) {
      if (!mail) {
        setFormError(`Work email (${supabaseRegistration.orgSuffix}) is required.`);
        return;
      }
      if (!mLow.endsWith(suf)) {
        setFormError(`Work email must end with ${supabaseRegistration.orgSuffix}`);
        return;
      }
    } else if (mail && !mLow.endsWith(suf)) {
      setFormError(`Work email must end with ${supabaseRegistration.orgSuffix}`);
      return;
    }
    if (!mp || mp.length < 8) {
      setFormError("Master password at least 8 characters.");
      return;
    }
    if (mp !== confirmMp) {
      setFormError("Confirmation does not match.");
      return;
    }
    setBusy(true);
    try {
      const res = await api.createVault({ masterPassword: mp, email: mail });
      setMp("");
      setConfirmMp("");
      setAccountEmail("");
      setVaultExists(true);
      setUnlocked(true);
      setCategoryFilter(null);
      if (res?.supabaseSynced) {
        showToast("Registered with your organisation account.");
      } else if (res?.supabaseError) {
        showToast(`Vault created; cloud sync: ${res.supabaseError}`);
      }
    } catch (e) {
      setFormError(e.message || "Setup failed");
    } finally {
      setBusy(false);
    }
  };

  const handleLock = async () => {
    await api.lock();
    setUnlocked(false);
    setItems([]);
    setCategories([]);
    setNoteFolders([]);
    setNotes([]);
    setNoteFolderFilter(null);
    setNoteSearch("");
    setNoteEditorNote(null);
    setNoteNameModal(false);
    setNoteFolderModal(false);
    setVaultPinnedFront(false);
    if (typeof api?.setMainAlwaysOnTop === "function") {
      void api.setMainAlwaysOnTop(false);
    }
    setDetailCred(null);
    setCredModal(null);
    setRevealedPw(false);
    setShowUnlockPw(false);
    setShowCreateMp(false);
    setShowConfirmMpVis(false);
    setMp("");
  };

  const addCategory = async () => {
    const n = newCatName.trim();
    if (!n) return;
    try {
      await api.addCategory(n);
      setNewCatName("");
      setCategoryModal(false);
      await refreshCategories();
      void api.pingActivity();
    } catch (e) {
      window.alert(e.message || String(e));
    }
  };

  const addNoteFolder = async () => {
    const n = newNoteFolderName.trim();
    if (!n) return;
    try {
      await api.addNoteFolder(n);
      setNewNoteFolderName("");
      setNoteFolderModal(false);
      await refreshNoteFolders();
      void api.pingActivity();
    } catch (e) {
      window.alert(e.message || String(e));
    }
  };

  const removeNoteFolder = async (fol) => {
    if (fol.name === "Inbox") {
      window.alert("The Inbox folder cannot be removed.");
      return;
    }
    if (
      !window.confirm(
        `Remove folder "${fol.name}"? Notes in it move to Inbox.`
      )
    ) {
      return;
    }
    try {
      await api.deleteNoteFolder(fol.id);
      if (noteFolderFilter === fol.id) setNoteFolderFilter(null);
      await refreshNoteFolders();
      await refreshNotes();
      void api.pingActivity();
    } catch (e) {
      window.alert(e.message || String(e));
    }
  };

  const openCreateNoteModal = () => {
    setNewNoteTitleInput("");
    setNoteNameModal(true);
  };

  const createNoteFromModal = async () => {
    const title = newNoteTitleInput.trim() || "Untitled";
    const inbox = noteFolders.find((f) => f.name === "Inbox");
    const fid =
      noteFolderFilter != null ? noteFolderFilter : inbox?.id ?? noteFolders[0]?.id;
    if (fid == null) {
      window.alert("No note folder available.");
      return;
    }
    try {
      const { id } = await api.addNote({
        title,
        body: "",
        color: 0,
        folderId: fid,
      });
      await refreshNotes();
      const list = await api.listNotes();
      const created = list.find((x) => x.id === id);
      setNoteEditorNote(created || { id, title, body: "", color: 0, folderId: fid });
      setNoteNameModal(false);
      void api.pingActivity();
    } catch (e) {
      window.alert(e.message || String(e));
    }
  };

  const removeCategory = async (cat) => {
    if (cat.name === "General") {
      window.alert("The General category cannot be removed.");
      return;
    }
    if (
      !window.confirm(
        `Remove category "${cat.name}"? Items in it move to General.`
      )
    ) {
      return;
    }
    try {
      await api.deleteCategory(cat.id);
      if (categoryFilter === cat.id) setCategoryFilter(null);
      await refreshCategories();
      await refreshList();
      void api.pingActivity();
    } catch (e) {
      window.alert(e.message || String(e));
    }
  };

  const openAddCredential = () => {
    const gid =
      categoryFilter ??
      categories.find((c) => c.name === "General")?.id ??
      categories[0]?.id;
    setCredModal({
      url: "",
      username: "",
      password: "",
      categoryId: gid,
      appName: "",
      notes: "",
      favorite: false,
    });
  };

  if (!api) {
    return (
      <div className="flex h-screen items-center justify-center p-8 text-g-red">
        Run inside Electron with preload.
      </div>
    );
  }

  if (checking) {
    return (
      <WindowShell>
        <div className="flex h-full items-center justify-center bg-vault-bg font-sans text-vault-text">
          Starting…
        </div>
      </WindowShell>
    );
  }

  if (bootError) {
    return (
      <WindowShell>
        <div className="flex h-full flex-col items-center justify-center gap-4 p-10 font-sans text-g-red">
          <div className="text-lg font-semibold">Startup error</div>
          <pre className="max-w-xl whitespace-pre-wrap text-sm">{bootError}</pre>
        </div>
      </WindowShell>
    );
  }

  if (!unlocked) {
    return (
      <WindowShell>
      <div className="relative flex h-full min-h-0 items-center justify-center overflow-auto overflow-x-hidden bg-gradient-to-br from-[#f5f5f7] via-white to-[#e8f4ff] p-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,rgba(0,122,255,0.12),transparent_50%),radial-gradient(ellipse_at_80%_100%,rgba(175,82,222,0.08),transparent_45%)]" />
        <div className="relative w-full max-w-md rounded-[28px] border border-black/[0.08] bg-white/80 p-10 shadow-float backdrop-blur-vault">
          <div className="mb-8 flex flex-col items-center text-center">
            <LogoMark className="h-14 w-14 shadow-md" />
            <div className="mt-5 text-2xl font-semibold tracking-tight text-vault-text">
              Myvault
            </div>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-vault-muted">
              Encrypted vault on this device. Organize logins by category.
            </p>
          </div>
          <form
            className="block w-full"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (busy) return;
              void (vaultExists ? handleUnlock() : handleCreateVault());
            }}
          >
          {!vaultExists ? (
            <>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-vault-muted">
                Work email
                {!supabaseRegistration.configured ? (
                  <span className="ml-1 font-normal normal-case text-vault-muted/90">
                    (optional)
                  </span>
                ) : (
                  <span className="text-apple-red"> *</span>
                )}
              </label>
              <input
                type="email"
                autoComplete="email"
                spellCheck={false}
                placeholder={
                  supabaseRegistration.orgSuffix
                    ? `you${supabaseRegistration.orgSuffix}`
                    : "you@yourcompany.com"
                }
                value={accountEmail}
                onChange={(e) => setAccountEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  if (!busy && !vaultExists) void handleCreateVault();
                }}
                className="mt-2 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-sm text-vault-text outline-none ring-apple-blue/20 transition focus:ring-2"
              />
              <label className="mt-6 block text-[11px] font-semibold uppercase tracking-wide text-vault-muted">
                Master password
              </label>
              <div className="relative mt-2">
                <input
                  type={showCreateMp ? "text" : "password"}
                  autoComplete="new-password"
                  value={mp}
                  onChange={(e) => setMp(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    if (!busy && !vaultExists) void handleCreateVault();
                  }}
                  className="w-full rounded-xl border border-black/[0.08] bg-white py-2.5 pl-3 pr-11 text-sm text-vault-text outline-none ring-apple-blue/20 transition focus:ring-2"
                />
                <button
                  type="button"
                  aria-label={showCreateMp ? "Hide password" : "Show password"}
                  onClick={() => setShowCreateMp((v) => !v)}
                  className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-vault-muted transition hover:bg-black/[0.05] hover:text-vault-text"
                >
                  {showCreateMp ? <IconVisibilityClosed /> : <IconVisibilityOpen />}
                </button>
              </div>
              <label className="mt-6 block text-[11px] font-semibold uppercase tracking-wide text-vault-muted">
                Confirm
              </label>
              <div className="relative mt-2">
                <input
                  type={showConfirmMpVis ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirmMp}
                  onChange={(e) => setConfirmMp(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    if (!busy && !vaultExists) void handleCreateVault();
                  }}
                  className="w-full rounded-xl border border-black/[0.08] bg-white py-2.5 pl-3 pr-11 text-sm text-vault-text outline-none ring-apple-blue/20 transition focus:ring-2"
                />
                <button
                  type="button"
                  aria-label={showConfirmMpVis ? "Hide password" : "Show password"}
                  onClick={() => setShowConfirmMpVis((v) => !v)}
                  className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-vault-muted transition hover:bg-black/[0.05] hover:text-vault-text"
                >
                  {showConfirmMpVis ? (
                    <IconVisibilityClosed />
                  ) : (
                    <IconVisibilityOpen />
                  )}
                </button>
              </div>
            </>
          ) : (
            <>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-vault-muted">
                Master password
              </label>
              <div className="relative mt-2">
                <input
                  autoFocus
                  type={showUnlockPw ? "text" : "password"}
                  autoComplete="current-password"
                  value={mp}
                  onChange={(e) => setMp(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    if (!busy && vaultExists) void handleUnlock();
                  }}
                  className="w-full rounded-xl border border-black/[0.08] bg-white py-2.5 pl-3 pr-11 text-sm text-vault-text outline-none ring-apple-blue/20 transition focus:ring-2"
                />
                <button
                  type="button"
                  aria-label={showUnlockPw ? "Hide password" : "Show password"}
                  onClick={() => setShowUnlockPw((v) => !v)}
                  className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-vault-muted transition hover:bg-black/[0.05] hover:text-vault-text"
                >
                  {showUnlockPw ? <IconVisibilityClosed /> : <IconVisibilityOpen />}
                </button>
              </div>
            </>
          )}
          {formError ? <p className="mt-4 text-sm text-apple-red">{formError}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="mt-8 w-full rounded-xl bg-apple-blue py-3 text-sm font-semibold text-white shadow-md shadow-apple-blue/25 transition hover:bg-[#0066d6] disabled:opacity-50"
          >
            {!vaultExists ? "Create vault" : "Unlock"}
          </button>
          {vaultExists && supabaseRegistration.configured && unlockRejectedBadPw ? (
            <button
              type="button"
              onClick={() => {
                setRecoverModalOpen(true);
                setRecoveryError(null);
              }}
              className="mt-5 w-full text-center text-sm font-medium text-apple-blue transition hover:underline"
            >
              Forgot password?
            </button>
          ) : null}
          </form>
        </div>
        {recoverModalOpen ? (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-5">
            <button
              type="button"
              className="absolute inset-0 bg-slate-900/35 backdrop-blur-sm"
              aria-label="Close reset dialog"
              onClick={closeRecoveryModal}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="reset-pw-title"
              className="relative z-10 flex w-full max-w-md flex-col gap-3 rounded-[28px] border border-white/55 bg-white/60 p-8 shadow-float backdrop-blur-2xl"
            >
              <div
                id="reset-pw-title"
                className="text-center text-xl font-semibold tracking-tight text-vault-text"
              >
                Reset password
              </div>
              <label className="mt-1 block text-[11px] font-semibold uppercase tracking-wide text-vault-muted">
                Encryption key
              </label>
              <input
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={recoveryKeyPlain}
                onChange={(e) => setRecoveryKeyPlain(e.target.value)}
                placeholder="e.g. a1b2c3d4e5f6… (paste full key)"
                className="w-full rounded-xl border border-black/[0.08] bg-white/90 px-3 py-2.5 font-mono text-xs tracking-wide text-vault-text outline-none ring-apple-blue/20 transition focus:ring-2"
              />
              <label className="mt-1 block text-[11px] font-semibold uppercase tracking-wide text-vault-muted">
                New password
              </label>
              <input
                type="password"
                autoComplete="new-password"
                value={recoveryNewPw}
                onChange={(e) => setRecoveryNewPw(e.target.value)}
                className="w-full rounded-xl border border-black/[0.08] bg-white/90 px-3 py-2.5 text-sm text-vault-text outline-none ring-apple-blue/20 transition focus:ring-2"
              />
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-vault-muted">
                Confirm new password
              </label>
              <input
                type="password"
                autoComplete="new-password"
                value={recoveryConfirmPw}
                onChange={(e) => setRecoveryConfirmPw(e.target.value)}
                className="w-full rounded-xl border border-black/[0.08] bg-white/90 px-3 py-2.5 text-sm text-vault-text outline-none ring-apple-blue/20 transition focus:ring-2"
              />
              {recoveryError ? (
                <p className="text-sm text-apple-red">{recoveryError}</p>
              ) : null}
              <div className="mt-3 flex gap-3">
                <button
                  type="button"
                  disabled={recoveryBusy}
                  onClick={closeRecoveryModal}
                  className="flex-1 rounded-xl border border-black/[0.12] bg-white/80 py-3 text-sm font-semibold text-vault-text shadow-sm transition hover:bg-white disabled:opacity-50"
                >
                  Decline
                </button>
                <button
                  type="button"
                  disabled={recoveryBusy}
                  onClick={() => void handleRecoveryConfirm()}
                  className="flex-1 rounded-xl bg-apple-blue py-3 text-sm font-semibold text-white shadow-md shadow-apple-blue/25 transition hover:bg-[#0066d6] disabled:opacity-50"
                >
                  {recoveryBusy ? "Working…" : "Confirm"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
      </WindowShell>
    );
  }

  if (unlocked && noteFloatBootId !== null) {
    return (
      <FloatNoteWindow
        noteId={noteFloatBootId}
        syncBump={floatNoteSync}
        refreshNotes={refreshNotes}
      />
    );
  }

  const showCategoryPanel = pane === "items";
  const showNotesFolderPanel = pane === "notes";
  /* Fixed rail: left 16px + icon 56px + gap 12px + secondary 220px; +12 matches gap-3 between rail & panel */
  const sidebarOccupiedPx = showCategoryPanel || showNotesFolderPanel ? 304 : 96;
  const gapBeforeContentPx = 12;
  const mainPadLeft = sidebarOccupiedPx + gapBeforeContentPx;

  const hasWinChrome = typeof api?.winMinimize === "function";
  const railTopClass = hasWinChrome ? "top-[60px]" : "top-4";
  const railHeightClass = hasWinChrome ? "h-[calc(100vh-76px)]" : "h-[calc(100vh-32px)]";

  return (
    <WindowShell>
    <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-gradient-to-br from-[#f5f5f7] via-white to-[#eef3ff] font-sans text-vault-text">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,rgba(0,122,255,0.06),transparent),radial-gradient(ellipse_80%_50%_at_100%_50%,rgba(52,168,83,0.04),transparent)]" />

      <div className="relative flex min-h-0 flex-1" style={{ paddingLeft: mainPadLeft }}>
        <div className={`pointer-events-none fixed left-4 z-40 flex gap-3 ${railTopClass} ${railHeightClass}`}>
          <nav className="glass-rail pointer-events-auto flex w-[56px] flex-col items-center rounded-2xl px-2 py-4">
            <button
              type="button"
              className="flex h-11 w-11 items-center justify-center rounded-xl transition-opacity hover:opacity-90"
              title="Myvault home"
              onClick={() => {
                setPane("items");
                setCategoryFilter(null);
                void api.pingActivity();
              }}
            >
              <LogoMark className="h-9 w-9" />
            </button>
            <div className="my-4 h-px w-8 bg-black/[0.06]" />
            <RailIconButton
              title="All items"
              active={pane === "items"}
              onClick={() => {
                setPane("items");
                void api.pingActivity();
              }}
            >
              <IconGrid />
            </RailIconButton>
            <RailIconButton
              title="Notes"
              active={pane === "notes"}
              onClick={() => {
                setPane("notes");
                void api.pingActivity();
              }}
            >
              <IconNotes />
            </RailIconButton>
            <RailIconButton
              title="Favorites"
              active={pane === "favorites"}
              onClick={() => {
                setCategoryFilter(null);
                setPane("favorites");
                void api.pingActivity();
              }}
            >
              <IconStarSoft />
            </RailIconButton>
            <RailIconButton
              title="Browser extension"
              active={pane === "extension"}
              onClick={() => {
                setPane("extension");
                void api.pingActivity();
              }}
            >
              <IconExtension />
            </RailIconButton>
            <div className="flex-1" />
            <RailIconButton title="Lock vault" active={false} onClick={() => void handleLock()}>
              <IconLock />
            </RailIconButton>
          </nav>

          {showNotesFolderPanel ? (
            <aside className="glass-rail pointer-events-auto flex w-[220px] flex-col overflow-hidden rounded-2xl">
              <div className="border-b border-black/[0.06] px-4 py-3.5">
                <div className="text-[13px] font-semibold">Note folders</div>
                <p className="mt-1 text-[11px] leading-snug text-vault-muted">
                  Filter notes · add folders for your notes
                </p>
              </div>
              <div className="max-h-[40vh] min-h-0 flex-1 overflow-y-auto px-2 py-2">
                <button
                  type="button"
                  onClick={() => {
                    setNoteFolderFilter(null);
                    void api.pingActivity();
                  }}
                  className={`mb-1 w-full rounded-xl px-3 py-2.5 text-left text-[13px] transition ${
                    noteFolderFilter == null
                      ? "bg-apple-blue/12 font-medium text-apple-blue"
                      : "text-vault-muted hover:bg-black/[0.04]"
                  }`}
                >
                  All folders
                </button>
                {noteFolders
                  .filter((f) => String(f.name).toLowerCase() !== "inbox")
                  .map((f) => (
                  <div key={f.id} className="mb-1 flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setNoteFolderFilter(f.id);
                        void api.pingActivity();
                      }}
                      className={`min-w-0 flex-1 truncate rounded-xl px-3 py-2.5 text-left text-[13px] transition ${
                        noteFolderFilter === f.id
                          ? "bg-apple-blue/12 font-medium text-apple-blue"
                          : "text-vault-muted hover:bg-black/[0.04]"
                      }`}
                    >
                      {f.name}
                    </button>
                    <button
                      type="button"
                      title="Remove folder"
                      className="shrink-0 rounded-lg px-2 py-2 text-vault-muted transition hover:bg-g-red/10 hover:text-g-red"
                      onClick={() => void removeNoteFolder(f)}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setNoteFolderModal(true);
                    setNewNoteFolderName("");
                  }}
                  className="mt-1 flex w-full items-center gap-2 rounded-xl border border-dashed border-black/15 px-3 py-2.5 text-left text-[13px] text-apple-blue transition hover:bg-apple-blue/5"
                >
                  <span className="text-lg leading-none">+</span>
                  Add folder
                </button>
              </div>
            </aside>
          ) : null}

          {showCategoryPanel ? (
            <aside className="glass-rail pointer-events-auto flex w-[220px] flex-col overflow-hidden rounded-2xl">
              <div className="border-b border-black/[0.06] px-4 py-3.5">
                <div className="text-[13px] font-semibold">Categories</div>
                <p className="mt-1 text-[11px] leading-snug text-vault-muted">
                  Filter vault · add folders here
                </p>
              </div>
              <div className="max-h-[40vh] min-h-0 flex-1 overflow-y-auto px-2 py-2">
                <button
                  type="button"
                  onClick={() => {
                    setCategoryFilter(null);
                    setPane("items");
                    void api.pingActivity();
                  }}
                  className={`mb-1 w-full rounded-xl px-3 py-2.5 text-left text-[13px] transition ${
                    categoryFilter == null
                      ? "bg-apple-blue/12 font-medium text-apple-blue"
                      : "text-vault-muted hover:bg-black/[0.04]"
                  }`}
                >
                  All categories
                </button>
                {categoriesSidebar.map((c) => (
                  <div key={c.id} className="mb-1 flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setCategoryFilter(c.id);
                        setPane("items");
                        void api.pingActivity();
                      }}
                      className={`min-w-0 flex-1 truncate rounded-xl px-3 py-2.5 text-left text-[13px] transition ${
                        categoryFilter === c.id
                          ? "bg-apple-blue/12 font-medium text-apple-blue"
                          : "text-vault-muted hover:bg-black/[0.04]"
                      }`}
                    >
                      {c.name}
                    </button>
                    {c.name !== "General" ? (
                      <button
                        type="button"
                        title="Remove category"
                        className="shrink-0 rounded-lg px-2 py-2 text-vault-muted transition hover:bg-g-red/10 hover:text-g-red"
                        onClick={() => void removeCategory(c)}
                      >
                        ×
                      </button>
                    ) : (
                      <span className="w-7 shrink-0" />
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setCategoryModal(true);
                    setNewCatName("");
                  }}
                  className="mt-1 flex w-full items-center gap-2 rounded-xl border border-dashed border-black/15 px-3 py-2.5 text-left text-[13px] text-apple-blue transition hover:bg-apple-blue/5"
                >
                  <span className="text-lg leading-none">+</span>
                  Add category
                </button>
              </div>
            </aside>
          ) : null}
        </div>

        <div className="relative flex min-w-0 flex-1 flex-col pl-0 pr-6 pt-6 pb-8 lg:pr-8">
          {pane === "extension" ? (
            <>
              <header className="mb-6 flex items-center gap-4">
                <h1
                  key={headerTitle}
                  className="animate-vault-header text-xl font-semibold tracking-tight"
                >
                  {headerTitle}
                </h1>
              </header>
              <div className="max-w-2xl space-y-6 text-sm">
                <p className="text-vault-muted">
                  Paste the token into the extension options. The API is available while this vault
                  is unlocked.
                </p>
                <div className="glass-panel rounded-2xl p-6">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-vault-muted">
                    API base URL
                  </div>
                  <code className="mt-2 block break-all rounded-lg bg-black/[0.04] px-3 py-2 text-[13px] text-g-blue">
                    {apiBaseUrl}
                  </code>
                  <div className="mt-6 text-[11px] font-semibold uppercase tracking-wide text-vault-muted">
                    Bearer token
                  </div>
                  <div className="mt-2 rounded-lg bg-black/[0.04] px-3 py-3 font-mono text-xs text-vault-text">
                    <TokenMask />
                  </div>
                  <div className="mt-6 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-xl border border-black/[0.08] bg-white px-4 py-2 text-xs font-medium shadow-sm"
                      onClick={async () => {
                        const t = await api.getExtensionToken();
                        await api.copyToClipboard(t || "");
                        showToast("Token copied");
                      }}
                    >
                      Copy token
                    </button>
                    <button
                      type="button"
                      className="rounded-xl border border-g-yellow/40 bg-g-yellow/10 px-4 py-2 text-xs font-medium text-[#b06000]"
                      onClick={async () => {
                        if (
                          window.confirm(
                            "Rotate token? Update the extension with the new value."
                          )
                        ) {
                          const t = await api.regenerateExtensionToken();
                          if (t) await api.copyToClipboard(t);
                          showToast("New token copied");
                          void api.pingActivity();
                        }
                      }}
                    >
                      Rotate token
                    </button>
                  </div>
                </div>
                <div className="glass-panel rounded-2xl p-6">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-vault-muted">
                    App updates
                  </div>
                  <p className="mt-2 text-[13px] leading-relaxed text-vault-muted">
                    Check installers published via GitHub Releases. After downloading, restart once to finish
                    the update.
                  </p>
                  <div className="mt-5 flex flex-wrap items-end gap-x-6 gap-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={
                          updaterPackaged === false ||
                          updaterChecking ||
                          typeof api?.checkForUpdatesManual !== "function"
                        }
                        title={
                          updaterPackaged === false
                            ? "Use the packaged desktop app"
                            : "Compare this build with the latest GitHub release"
                        }
                        className="rounded-xl border border-black/[0.08] bg-white px-4 py-2 text-xs font-medium shadow-sm transition hover:bg-black/[0.02] disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => void checkUpdatesFromUi()}
                      >
                        {updaterChecking ? "Checking…" : "Check for updates"}
                      </button>
                      {updaterDlBusy ? (
                        <span className="text-xs text-vault-muted">Downloading…</span>
                      ) : null}
                    </div>
                    <div className="min-w-[200px] flex-1 space-y-1 text-right text-[11px] leading-snug text-vault-muted sm:ml-auto">
                      <div>
                        Last checked:{" "}
                        {updaterLastCheckIso
                          ? formatUpdaterDate(updaterLastCheckIso)
                          : "—"}
                      </div>
                      {installedAppVersion ? <div>This build: {installedAppVersion}</div> : null}
                      {updaterOffer?.releaseDate ? (
                        <div>Latest release: {formatUpdaterDate(updaterOffer.releaseDate)}</div>
                      ) : null}
                    </div>
                  </div>
                  {typeof updaterDownloadProgress === "number" ? (
                    <div className="mt-5">
                      <div className="h-2 overflow-hidden rounded-full bg-black/[0.06]">
                        <div
                          className="h-2 rounded-full bg-apple-blue transition-[width] duration-300"
                          style={{
                            width: `${Math.min(
                              100,
                              Math.max(0, updaterDownloadProgress || 0)
                            )}%`,
                          }}
                        />
                      </div>
                      <div className="mt-2 text-[11px] text-vault-muted tabular-nums">
                        Download progress {updaterDownloadProgress}%
                      </div>
                    </div>
                  ) : null}
                  {updaterPackaged === false ? (
                    <p className="mt-4 text-[12px] text-vault-muted">
                      Install the packaged desktop app from a release installer to enable in-app updates.
                    </p>
                  ) : null}
                  {updaterOffer && updaterPackaged !== false ? (
                    <div className="mt-5 rounded-xl border border-apple-blue/20 bg-white/65 px-4 py-3 shadow-sm backdrop-blur-sm">
                      <div className="text-[13px] font-semibold text-vault-text">
                        {updaterDownloadedVersion &&
                        updaterOffer &&
                        updaterDownloadedVersion === updaterOffer.version
                          ? `Update ready · ${updaterOffer.version}`
                          : `New update available · ${updaterOffer.version}${updaterOffer.releaseName ? ` · ${updaterOffer.releaseName}` : ""}`}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {!(
                          updaterOffer &&
                          updaterDownloadedVersion &&
                          updaterDownloadedVersion === updaterOffer.version
                        ) ? (
                          <button
                            type="button"
                            disabled={
                              updaterDlBusy ||
                              typeof api?.downloadAvailableUpdate !== "function"
                            }
                            className="rounded-xl bg-apple-blue px-4 py-2 text-xs font-semibold text-white shadow-md shadow-apple-blue/20 transition hover:bg-[#0066d6] disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={() => void beginUpdaterDownload()}
                          >
                            {updaterDlBusy ? "Downloading…" : "Download & update"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={typeof api?.quitAndInstallUpdate !== "function"}
                            className="rounded-xl bg-apple-blue px-4 py-2 text-xs font-semibold text-white shadow-md shadow-apple-blue/20 transition hover:bg-[#0066d6] disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={quitAndInstallFromUi}
                          >
                            Restart to install now
                          </button>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </>
          ) : pane === "notes" ? (
            <>
              <header className="mb-6 flex flex-wrap items-center gap-4">
                <h1
                  key={`notes-${noteFolderFilter ?? "all"}`}
                  className="animate-vault-header min-w-[8rem] text-xl font-semibold tracking-tight"
                >
                  {headerTitle}
                </h1>
                <div className="flex min-w-[200px] flex-1 justify-end gap-3">
                  <input
                    value={noteSearch}
                    placeholder="Search notes…"
                    onChange={(e) => setNoteSearch(e.target.value)}
                    className="min-w-[12rem] max-w-md flex-1 rounded-xl border border-black/[0.08] bg-white/90 px-4 py-2.5 text-sm text-vault-text shadow-sm outline-none ring-apple-blue/25 transition placeholder:text-vault-muted/80 focus:ring-2"
                  />
                  <button
                    type="button"
                    className="shrink-0 rounded-xl bg-apple-blue px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-apple-blue/20 transition hover:bg-[#0066d6]"
                    onClick={() => openCreateNoteModal()}
                  >
                    Add note
                  </button>
                </div>
              </header>
              <p className="-mt-4 mb-6 text-[13px] text-vault-muted">
                Notes stay inside Myvault on this device, saved to your local vault database when you type.
              </p>
              {notesFiltered.length === 0 ? (
                <div className="glass-panel mx-auto mt-8 flex max-w-lg flex-col items-center rounded-[28px] px-10 py-16 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-apple-blue/12 text-apple-blue">
                    <IconNotesLarge />
                  </div>
                  <h2 className="mt-6 text-lg font-semibold text-vault-text">No notes yet</h2>
                  <p className="mt-3 max-w-sm text-sm leading-relaxed text-vault-muted">
                    Capture quick thoughts in lined notes. Pick a folder on the left, then add your first note.
                  </p>
                  <button
                    type="button"
                    onClick={() => openCreateNoteModal()}
                    className="mt-8 rounded-xl bg-apple-blue px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-apple-blue/25"
                  >
                    Add note
                  </button>
                </div>
              ) : (
                <div className="animate-vault-grid grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {notesFiltered.map((n) => (
                    <div
                      key={n.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setNoteEditorNote({ ...n });
                        void api.pingActivity();
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setNoteEditorNote({ ...n });
                          void api.pingActivity();
                        }
                      }}
                      className="group relative flex min-h-[8rem] w-full min-w-0 cursor-pointer flex-col overflow-hidden rounded-2xl border border-black/[0.08] text-left shadow-sm outline-none ring-apple-blue/25 transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-float focus-visible:ring-2"
                      style={noteCardSurfaceStyle(n.color)}
                    >
                      <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex items-center justify-between gap-2 px-2 pt-2">
                        <button
                          type="button"
                          title="Bring to desktop"
                          className="pointer-events-auto rounded-lg p-1.5 text-vault-text/75 transition hover:bg-black/[0.07] hover:text-apple-blue"
                          onClick={(e) => {
                            e.stopPropagation();
                            void (async () => {
                              const r = await api.openNoteFloatWindow(n.id);
                              if (r?.ok === false) window.alert("Could not open desktop window.");
                              void api.pingActivity();
                            })();
                          }}
                        >
                          <IconMonitorSmall />
                        </button>
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            title={n.favorite ? "Remove from favorites" : "Add to favorites"}
                            className={`pointer-events-auto rounded-lg p-1.5 transition hover:bg-black/[0.07] ${
                              n.favorite ? "text-g-yellow" : "text-vault-text/55"
                            }`}
                            onClick={(e) => {
                              e.stopPropagation();
                              void (async () => {
                                await api.updateNote(n.id, { favorite: !n.favorite });
                                await refreshNotes();
                                void api.pingActivity();
                              })();
                            }}
                          >
                            <svg
                              width="20"
                              height="20"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                              className="drop-shadow-sm"
                              aria-hidden
                            >
                              <path d="M12 3.2c.35 0 .67.2.83.51l1.88 3.82 4.2.61c.92.13 1.29 1.27.62 1.92l-3.04 2.97.72 4.19c.16.92-.8 1.62-1.62 1.34L12 16.9l-3.76 1.98c-.82.27-1.78-.42-1.62-1.34l.72-4.19-3.04-2.97c-.67-.65-.3-1.79.62-1.92l4.2-.61 1.88-3.82c.16-.31.48-.51.83-.51z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            title={vaultPinnedFront ? "Unpin vault from front" : "Pin vault in front of other apps"}
                            className={`pointer-events-auto rounded-lg p-1.5 transition hover:bg-black/[0.07] ${
                              vaultPinnedFront ? "text-apple-blue" : "text-vault-text/55"
                            }`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setPinnedAndSync(!vaultPinnedFront);
                              void api.pingActivity();
                            }}
                          >
                            <IconPinSmall filled={vaultPinnedFront} />
                          </button>
                        </div>
                      </div>
                      <div className="flex min-h-0 flex-1 flex-col px-4 pb-3 pt-10">
                        <div className="truncate text-[15px] font-semibold leading-tight text-vault-text drop-shadow-[0_1px_0_rgba(255,255,255,0.6)]">
                          {n.title}
                        </div>
                        <div className="mt-1.5 line-clamp-4 min-h-[3rem] flex-1 text-[12px] leading-relaxed text-vault-text/80">
                          {(n.body || "").trim() ? truncateNote(String(n.body), 180) : "Empty note"}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : pane === "favorites" ? (
            <>
              <header className="mb-6 flex flex-wrap items-center gap-4">
                <h1 className="animate-vault-header min-w-[8rem] text-xl font-semibold tracking-tight">
                  Favorites
                </h1>
                <div className="flex min-w-[200px] flex-1 justify-end">
                  <input
                    value={search}
                    placeholder="Search favorites…"
                    onChange={(e) => setSearch(e.target.value)}
                    className="min-w-[12rem] max-w-md flex-1 rounded-xl border border-black/[0.08] bg-white/90 px-4 py-2.5 text-sm text-vault-text shadow-sm outline-none ring-apple-blue/25 transition placeholder:text-vault-muted/80 focus:ring-2"
                  />
                </div>
              </header>
              <p className="-mt-4 mb-6 text-[13px] text-vault-muted">
                Passwords and notes you starred — sorted by recently updated.
              </p>
              {favoritesDashboardRows.length === 0 ? (
                <div className="glass-panel mx-auto mt-8 flex max-w-lg flex-col items-center rounded-[28px] px-10 py-16 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-g-yellow/15 text-g-yellow">
                    <svg
                      width="36"
                      height="36"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="opacity-90"
                      aria-hidden
                    >
                      <path d="M12 2.5c.4 0 .8.2 1 .6l2.1 4.3 4.7.7c.5.1.9.5 1 1 .1.5-.1 1-.5 1.3l-3.4 3.3.8 4.7c.1.5-.1 1-.5 1.3-.4.3-1 .3-1.4 0L12 18.2 8.3 20.4c-.4.3-1 .2-1.4-.1-.4-.3-.6-.8-.5-1.3l.8-4.7-3.4-3.3c-.4-.3-.6-.8-.5-1.3.1-.5.5-.9 1-1l4.7-.7 2.1-4.3c.2-.4.6-.6 1-.6z" />
                    </svg>
                  </div>
                  <h2 className="mt-6 text-lg font-semibold text-vault-text">No favorites yet</h2>
                  <p className="mt-3 max-w-sm text-sm leading-relaxed text-vault-muted">
                    Go to <strong>All items</strong> or <strong>Notes</strong> and tap the star on a password card or
                    note to show it here.
                  </p>
                </div>
              ) : (
                <div
                  key={`favorites-grid-${search.trim()}`}
                  className="animate-vault-grid grid grid-cols-1 gap-5 sm:gap-6 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
                >
                  {favoritesDashboardRows.map((row) =>
                    row.kind === "cred" ? (
                      <CredCard
                        key={`c-${row.entry.id}`}
                        entry={row.entry}
                        onOpen={() => {
                          setDetailCred(row.entry);
                          setRevealedPw(false);
                          void api.pingActivity();
                        }}
                        onToggleFav={(e) => {
                          e.stopPropagation();
                          void (async () => {
                            await api.update(row.entry.id, { favorite: !row.entry.favorite });
                            await refreshList();
                            void api.pingActivity();
                          })();
                        }}
                        onCopyUsername={(e) => {
                          e.stopPropagation();
                          void (async () => {
                            const u = String(row.entry.username ?? "").trim();
                            if (!u) return;
                            await api.copyToClipboard(u, 30000);
                            showToast("Username copied");
                            void api.pingActivity();
                          })();
                        }}
                        onCopyPassword={(e) => {
                          e.stopPropagation();
                          void (async () => {
                            const p = row.entry.password ?? "";
                            if (!p) return;
                            await api.copyToClipboard(p, 30000);
                            showToast("Password copied");
                            void api.pingActivity();
                          })();
                        }}
                      />
                    ) : (
                      <div
                        key={`n-${row.note.id}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          setNoteEditorNote({ ...row.note });
                          void api.pingActivity();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setNoteEditorNote({ ...row.note });
                            void api.pingActivity();
                          }
                        }}
                        className="group relative flex min-h-[8rem] w-full min-w-0 cursor-pointer flex-col overflow-hidden rounded-2xl border border-black/[0.08] text-left shadow-sm outline-none ring-apple-blue/25 transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-float focus-visible:ring-2"
                        style={noteCardSurfaceStyle(row.note.color)}
                      >
                        <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex items-center justify-between gap-2 px-2 pt-2">
                          <button
                            type="button"
                            title="Bring to desktop"
                            className="pointer-events-auto rounded-lg p-1.5 text-vault-text/75 transition hover:bg-black/[0.07] hover:text-apple-blue"
                            onClick={(e) => {
                              e.stopPropagation();
                              void (async () => {
                                const r = await api.openNoteFloatWindow(row.note.id);
                                if (r?.ok === false) window.alert("Could not open desktop window.");
                                void api.pingActivity();
                              })();
                            }}
                          >
                            <IconMonitorSmall />
                          </button>
                          <div className="flex items-center gap-0.5">
                            <button
                              type="button"
                              title={row.note.favorite ? "Remove from favorites" : "Add to favorites"}
                              className={`pointer-events-auto rounded-lg p-1.5 transition hover:bg-black/[0.07] ${
                                row.note.favorite ? "text-g-yellow" : "text-vault-text/55"
                              }`}
                              onClick={(e) => {
                                e.stopPropagation();
                                void (async () => {
                                  await api.updateNote(row.note.id, { favorite: !row.note.favorite });
                                  await refreshNotes();
                                  void api.pingActivity();
                                })();
                              }}
                            >
                              <svg
                                width="20"
                                height="20"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                                className="drop-shadow-sm"
                                aria-hidden
                              >
                                <path d="M12 3.2c.35 0 .67.2.83.51l1.88 3.82 4.2.61c.92.13 1.29 1.27.62 1.92l-3.04 2.97.72 4.19c.16.92-.8 1.62-1.62 1.34L12 16.9l-3.76 1.98c-.82.27-1.78-.42-1.62-1.34l.72-4.19-3.04-2.97c-.67-.65-.3-1.79.62-1.92l4.2-.61 1.88-3.82c.16-.31.48-.51.83-.51z" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              title={vaultPinnedFront ? "Unpin vault from front" : "Pin vault in front of other apps"}
                              className={`pointer-events-auto rounded-lg p-1.5 transition hover:bg-black/[0.07] ${
                                vaultPinnedFront ? "text-apple-blue" : "text-vault-text/55"
                              }`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setPinnedAndSync(!vaultPinnedFront);
                                void api.pingActivity();
                              }}
                            >
                              <IconPinSmall filled={vaultPinnedFront} />
                            </button>
                          </div>
                        </div>
                        <div className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-black/[0.04] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-vault-muted">
                          Note
                        </div>
                        <div className="flex min-h-0 flex-1 flex-col px-4 pb-3 pt-10">
                          <div className="truncate text-[15px] font-semibold leading-tight text-vault-text drop-shadow-[0_1px_0_rgba(255,255,255,0.6)]">
                            {row.note.title}
                          </div>
                          <div className="mt-1.5 line-clamp-4 min-h-[3rem] flex-1 text-[12px] leading-relaxed text-vault-text/80">
                            {(row.note.body || "").trim()
                              ? truncateNote(String(row.note.body), 180)
                              : "Empty note"}
                          </div>
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <header className="mb-6 flex flex-wrap items-center gap-4">
                <h1
                  key={`items-${categoryFilter ?? "all"}`}
                  className="animate-vault-header min-w-[8rem] text-xl font-semibold tracking-tight"
                >
                  {headerTitle}
                </h1>
                <div className="flex min-w-[200px] flex-1 justify-end gap-3">
                  <input
                    value={search}
                    placeholder="Search apps, URLs, notes…"
                    onChange={(e) => setSearch(e.target.value)}
                    className="min-w-[12rem] max-w-md flex-1 rounded-xl border border-black/[0.08] bg-white/90 px-4 py-2.5 text-sm text-vault-text shadow-sm outline-none ring-apple-blue/25 transition placeholder:text-vault-muted/80 focus:ring-2"
                  />
                  <button
                    type="button"
                    className="shrink-0 rounded-xl bg-apple-blue px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-apple-blue/20 transition hover:bg-[#0066d6]"
                    onClick={openAddCredential}
                  >
                    Add password
                  </button>
                </div>
              </header>

              {listFiltered.length === 0 ? (
                <EmptyVaultState onAdd={openAddCredential} />
              ) : (
                <div
                  key={`grid-items-${categoryFilter ?? "all"}`}
                  className="animate-vault-grid grid grid-cols-1 gap-5 sm:gap-6 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
                >
                  {listFiltered.map((entry) => (
                    <CredCard
                      key={entry.id}
                      entry={entry}
                      onOpen={() => {
                        setDetailCred(entry);
                        setRevealedPw(false);
                        void api.pingActivity();
                      }}
                      onToggleFav={(e) => {
                        e.stopPropagation();
                        void (async () => {
                          await api.update(entry.id, { favorite: !entry.favorite });
                          await refreshList();
                          void api.pingActivity();
                        })();
                      }}
                      onCopyUsername={(e) => {
                        e.stopPropagation();
                        void (async () => {
                          const u = String(entry.username ?? "").trim();
                          if (!u) return;
                          await api.copyToClipboard(u, 30000);
                          showToast("Username copied");
                          void api.pingActivity();
                        })();
                      }}
                      onCopyPassword={(e) => {
                        e.stopPropagation();
                        void (async () => {
                          const p = entry.password ?? "";
                          if (!p) return;
                          await api.copyToClipboard(p, 30000);
                          showToast("Password copied");
                          void api.pingActivity();
                        })();
                      }}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {detailCred ? (
        <GlassDetailModal
          cred={detailCred}
          revealedPw={revealedPw}
          setRevealedPw={setRevealedPw}
          onClose={() => {
            setDetailCred(null);
            setRevealedPw(false);
          }}
          onEdit={() => {
            setCredModal({
              id: detailCred.id,
              url: detailCred.url || "",
              username: detailCred.username || "",
              password: detailCred.password || "",
              categoryId: detailCred.categoryId,
              appName: detailCred.titleRaw != null ? detailCred.titleRaw : "",
              notes: detailCred.notes || "",
              favorite: !!detailCred.favorite,
            });
          }}
          onDeleteRequest={() =>
            setPendingDelete({
              role: "cred",
              id: detailCred.id,
              title: detailCred.title || hostFromUrl(detailCred.url) || "Login",
              subtitle: String(detailCred.username || "").trim() || null,
            })
          }
          onCopyUsername={() => {
            const u = String(detailCred.username ?? "").trim();
            if (!u) return;
            void api.copyToClipboard(u, 30000);
            showToast("Username copied");
            void api.pingActivity();
          }}
          onCopyPassword={() => {
            const p = detailCred.password ?? "";
            if (!p) return;
            void api.copyToClipboard(p, 30000);
            showToast("Password copied");
            void api.pingActivity();
          }}
          onToggleFav={async () => {
            await api.update(detailCred.id, { favorite: !detailCred.favorite });
            await refreshList();
            const list = await api.list();
            const u = list.find((x) => x.id === detailCred.id);
            if (u) setDetailCred(u);
            void api.pingActivity();
          }}
        />
      ) : null}

      {categoryModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-6 backdrop-blur-[2px]">
          <div className="glass-modal w-full max-w-md rounded-[24px] p-8">
            <div className="mb-2 text-lg font-semibold">New category</div>
            <p className="mb-4 text-sm text-vault-muted">Unique name (e.g. Work, Finance).</p>
            <input
              value={newCatName}
              placeholder="Category name"
              onChange={(e) => setNewCatName(e.target.value)}
              className="w-full rounded-xl border border-black/[0.08] bg-white/90 px-4 py-3 text-sm outline-none ring-apple-blue/20 focus:ring-2"
              onKeyDown={(e) => e.key === "Enter" && addCategory()}
            />
            <div className="mt-8 flex justify-end gap-3">
              <button
                type="button"
                className="rounded-xl px-5 py-2.5 text-sm font-medium text-vault-muted hover:bg-black/[0.04]"
                onClick={() => setCategoryModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-xl bg-apple-blue px-5 py-2.5 text-sm font-semibold text-white"
                onClick={() => void addCategory()}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {credModal ? (
        <CredentialModal
          categories={categories}
          initial={credModal}
          onClose={() => setCredModal(null)}
          onSave={async (payload) => {
            if (payload.id) {
              await api.update(payload.id, {
                url: payload.url,
                username: payload.username,
                password: payload.password,
                favorite: !!payload.favorite,
                categoryId: payload.categoryId,
                title: payload.title,
                notes: payload.notes,
              });
            } else {
              await api.add({
                categoryId: payload.categoryId,
                url: payload.url,
                username: payload.username,
                password: payload.password,
                favorite: !!payload.favorite,
                title: payload.title,
                notes: payload.notes,
              });
            }
            await refreshList();
            setCredModal(null);
            if (detailCred && detailCred.id === payload.id) {
              const list = await api.list();
              const u = list.find((x) => x.id === payload.id);
              if (u) setDetailCred(u);
            }
            void api.pingActivity();
          }}
          generatePassword={generatePassword}
        />
      ) : null}

      {noteFolderModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-6 backdrop-blur-[2px]">
          <div className="glass-modal w-full max-w-md rounded-[24px] p-8">
            <div className="mb-2 text-lg font-semibold">New note folder</div>
            <p className="mb-4 text-sm text-vault-muted">Unique name for grouping notes inside the vault.</p>
            <input
              value={newNoteFolderName}
              placeholder="Folder name"
              onChange={(e) => setNewNoteFolderName(e.target.value)}
              className="w-full rounded-xl border border-black/[0.08] bg-white/90 px-4 py-3 text-sm outline-none ring-apple-blue/25 focus:ring-2"
              onKeyDown={(e) => e.key === "Enter" && void addNoteFolder()}
              autoFocus
            />
            <div className="mt-8 flex justify-end gap-3">
              <button
                type="button"
                className="rounded-xl px-5 py-2.5 text-sm font-medium text-vault-muted hover:bg-black/[0.04]"
                onClick={() => setNoteFolderModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-xl bg-apple-blue px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-apple-blue/20 hover:bg-[#0066d6]"
                onClick={() => void addNoteFolder()}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {noteNameModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-6 backdrop-blur-[2px]">
          <div className="glass-modal w-full max-w-md rounded-[24px] p-8">
            <div className="mb-2 text-lg font-semibold">Name your note</div>
            <p className="mb-4 text-sm text-vault-muted">
              You can rename it anytime. Leave blank to use &quot;Untitled&quot;.
            </p>
            <input
              value={newNoteTitleInput}
              placeholder="Note name"
              onChange={(e) => setNewNoteTitleInput(e.target.value)}
              className="w-full rounded-xl border border-black/[0.08] bg-white/90 px-4 py-3 text-sm outline-none ring-apple-blue/25 focus:ring-2"
              onKeyDown={(e) => e.key === "Enter" && void createNoteFromModal()}
              autoFocus
            />
            <div className="mt-8 flex justify-end gap-3">
              <button
                type="button"
                className="rounded-xl px-5 py-2.5 text-sm font-medium text-vault-muted hover:bg-black/[0.04]"
                onClick={() => setNoteNameModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-xl bg-apple-blue px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-apple-blue/20 hover:bg-[#0066d6]"
                onClick={() => void createNoteFromModal()}
              >
                Create &amp; edit
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {noteEditorNote ? (
        <VaultNoteEditorModal
          key={noteEditorNote.id}
          note={noteEditorNote}
          folders={noteFolders}
          onClose={() => setNoteEditorNote(null)}
          onAutosaved={refreshNotes}
          onDeleteRequest={() =>
            setPendingDelete({
              role: "note",
              id: noteEditorNote.id,
              title: String(noteEditorNote.title || "").trim() || "Untitled",
              subtitle: null,
            })
          }
        />
      ) : null}

      {pendingDelete ? (
        <GlassConfirmDeleteModal
          kind={pendingDelete.role === "note" ? "note" : "credential"}
          itemTitle={pendingDelete.title}
          itemSubtitle={pendingDelete.subtitle}
          onCancel={() => setPendingDelete(null)}
          onConfirm={async () => {
            try {
              if (pendingDelete.role === "cred") {
                await api.delete(pendingDelete.id);
                setDetailCred(null);
                await refreshList();
              } else {
                await api.deleteNote(pendingDelete.id);
                setNoteEditorNote(null);
                await refreshNotes();
              }
              setPendingDelete(null);
              showToast("Deleted");
              void api.pingActivity();
            } catch (e) {
              window.alert(e.message || String(e));
            }
          }}
        />
      ) : null}

      {updaterModal === "available" && updaterOffer ? (
        <GlassUpdaterAvailableModal
          version={updaterOffer.version}
          releaseName={updaterOffer.releaseName || ""}
          releaseDateLabel={
            updaterOffer.releaseDate ? formatUpdaterDate(updaterOffer.releaseDate) : ""
          }
          onUpdate={() => void beginUpdaterDownload()}
          onDecline={() => void declineUpdaterPrompt()}
        />
      ) : null}

      {updaterModal === "ready" && updaterDownloadedVersion ? (
        <GlassUpdaterReadyModal
          version={updaterDownloadedVersion}
          onRestart={quitAndInstallFromUi}
          onLater={dismissReadyUpdaterModal}
        />
      ) : null}

      {toast ? (
        <div className="pointer-events-none fixed bottom-8 left-1/2 z-[60] -translate-x-1/2 rounded-full border border-black/[0.06] bg-vault-text/90 px-5 py-2.5 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      ) : null}
    </div>
    </WindowShell>
  );
}

/** Desktop float: ruled notepad only; saves via Electron IPC every few ms after typing (+ Ctrl/Cmd+S) */
function DesktopOnlyNotepad({ note, onAutosaved }) {
  const [body, setBody] = useState(note.body || "");
  const timerRef = useRef(null);
  const skipUnmountSaveRef = useRef(false);
  const titleRef = useRef(note.title || "");
  const colorRef = useRef(Math.min(3, Math.max(0, note.color ?? 0)));
  const folderIdRef = useRef(note.folderId);
  const stateRef = useRef({ body: note.body || "" });

  useEffect(() => {
    titleRef.current = note.title || "";
    colorRef.current = Math.min(3, Math.max(0, note.color ?? 0));
    folderIdRef.current = note.folderId;
  }, [note.id, note.title, note.color, note.folderId]);

  useEffect(() => {
    const b = note.body || "";
    setBody(b);
    stateRef.current = { body: b };
  }, [note.id, note.updatedAt]);

  useEffect(() => {
    stateRef.current = { body };
  }, [body]);

  const saveImmediate = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const st = stateRef.current;
    try {
      await api.updateNote(note.id, {
        title: String(titleRef.current || "").trim() || "Untitled",
        body: st.body ?? "",
        color: colorRef.current,
        folderId: folderIdRef.current,
        favorite: !!note.favorite,
      });
      await onAutosaved();
    } catch (e) {
      window.alert(e.message || String(e));
    }
  }, [note.id, note.favorite, onAutosaved]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === "s") {
        e.preventDefault();
        void saveImmediate();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saveImmediate]);

  const scheduleSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void saveImmediate();
    }, NOTE_AUTOSAVE_MS);
  }, [saveImmediate]);

  useEffect(() => {
    return () => {
      if (skipUnmountSaveRef.current) return;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      const st = stateRef.current;
      void api.updateNote(note.id, {
        title: String(titleRef.current || "").trim() || "Untitled",
        body: st.body ?? "",
        color: colorRef.current,
        folderId: folderIdRef.current,
        favorite: !!note.favorite,
      });
    };
  }, [note.id, note.favorite]);

  const pal = NOTE_PALETTE[Math.min(3, Math.max(0, note.color ?? 0))] ?? NOTE_PALETTE[0];
  const padTop = 5;
  const padX = 14;

  return (
    <div className="relative flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-[#f5f6f8]">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-2">
        <div
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-black/[0.08] shadow-inner"
          style={{ backgroundColor: pal.tint }}
        >
          <textarea
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              scheduleSave();
            }}
            onBlur={() => void saveImmediate()}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="sentences"
            placeholder="Write on the lines…"
            className="min-h-0 w-full min-w-0 flex-1 resize-none border-0 bg-transparent font-sans text-slate-800 outline-none [box-sizing:border-box] [font-feature-settings:'tnum'] placeholder:text-slate-400/65 focus:ring-0"
            style={{
              fontSize: "14px",
              lineHeight: `${NOTE_LINE_PX}px`,
              padding: `${padTop}px ${padX}px ${padTop + 2}px`,
              backgroundImage: `repeating-linear-gradient(transparent, transparent ${
                NOTE_LINE_PX - 1
              }px, ${pal.line} ${NOTE_LINE_PX - 1}px, ${pal.line} ${NOTE_LINE_PX}px)`,
              backgroundSize: `100% ${NOTE_LINE_PX}px`,
              backgroundAttachment: "local",
              backgroundClip: "border-box",
            }}
          />
        </div>
      </div>
    </div>
  );
}

const FLOAT_NOTE_SUBTITLE = "Myvauld";

function FloatNoteWindow({ noteId, syncBump, refreshNotes }) {
  const [phase, setPhase] = useState("loading");
  const [note, setNote] = useState(null);

  useEffect(() => {
    let ok = true;
    void (async () => {
      try {
        const list = await api.listNotes();
        if (!ok) return;
        const n = list.find((x) => x.id === noteId);
        if (!n) {
          setPhase("missing");
          return;
        }
        setNote(n);
        setPhase("ok");
      } catch {
        if (ok) setPhase("missing");
      }
    })();
    return () => {
      ok = false;
    };
  }, [noteId, syncBump]);

  const titleBarName =
    note != null ? String(note.title ?? "").trim() || "Untitled" : "Note";

  if (phase === "loading") {
    return (
      <WindowShell title="Note" subtitle={FLOAT_NOTE_SUBTITLE}>
        <div className="flex h-full min-h-0 flex-1 items-center justify-center bg-gradient-to-br from-[#f5f5f7] via-white to-[#eef3ff] font-sans text-vault-muted">
          Loading note…
        </div>
      </WindowShell>
    );
  }

  if (phase === "missing" || !note) {
    return (
      <WindowShell title="Note" subtitle={FLOAT_NOTE_SUBTITLE}>
        <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-4 bg-gradient-to-br from-[#f5f5f7] via-white to-[#eef3ff] p-8 font-sans">
          <p className="text-sm font-medium text-vault-text">This note couldn’t be opened.</p>
          <button
            type="button"
            className="rounded-xl bg-apple-blue px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-apple-blue/20 hover:bg-[#0066d6]"
            onClick={() => void api.closeNoteFloatWindow()}
          >
            Close window
          </button>
        </div>
      </WindowShell>
    );
  }

  return (
    <WindowShell title={titleBarName} subtitle={FLOAT_NOTE_SUBTITLE}>
      <div className="flex min-h-0 h-full min-w-0 flex-1 flex-col overflow-hidden">
        <DesktopOnlyNotepad key={note.id} note={note} onAutosaved={refreshNotes} />
      </div>
    </WindowShell>
  );
}

function VaultNoteEditorModal({
  note,
  folders,
  onClose,
  onAutosaved,
  onDeleteRequest,
}) {
  const [title, setTitle] = useState(note.title || "");
  const [body, setBody] = useState(note.body || "");
  const [color, setColor] = useState(Math.min(3, Math.max(0, note.color ?? 0)));
  const [folderId, setFolderId] = useState(note.folderId);
  const [favorite, setFavorite] = useState(!!note.favorite);
  const timerRef = useRef(null);
  const skipUnmountSaveRef = useRef(false);
  const stateRef = useRef({
    title: note.title || "",
    body: note.body || "",
    color: Math.min(3, Math.max(0, note.color ?? 0)),
    folderId: note.folderId,
    favorite: !!note.favorite,
  });

  useEffect(() => {
    stateRef.current = { title, body, color, folderId, favorite };
  }, [title, body, color, folderId, favorite]);

  useEffect(() => {
    const c = Math.min(3, Math.max(0, note.color ?? 0));
    const t = note.title || "";
    const b = note.body || "";
    const fav = !!note.favorite;
    setTitle(t);
    setBody(b);
    setColor(c);
    setFolderId(note.folderId);
    setFavorite(fav);
    stateRef.current = {
      title: t,
      body: b,
      color: c,
      folderId: note.folderId,
      favorite: fav,
    };
  }, [note.id, note.updatedAt]);

  useEffect(() => {
    return () => {
      if (skipUnmountSaveRef.current) return;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      const st = stateRef.current;
      void api.updateNote(note.id, {
        title: String(st.title || "").trim() || "Untitled",
        body: st.body ?? "",
        color: st.color,
        folderId: st.folderId,
        favorite: !!st.favorite,
      });
    };
  }, [note.id]);

  const saveImmediate = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const st = stateRef.current;
    try {
      await api.updateNote(note.id, {
        title: String(st.title || "").trim() || "Untitled",
        body: st.body ?? "",
        color: st.color,
        folderId: st.folderId,
        favorite: !!st.favorite,
      });
      await onAutosaved();
    } catch (e) {
      window.alert(e.message || String(e));
    }
  }, [note.id, onAutosaved]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === "s") {
        e.preventDefault();
        void saveImmediate();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saveImmediate]);

  const scheduleSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void saveImmediate();
    }, NOTE_AUTOSAVE_MS);
  }, [saveImmediate]);

  const handleClose = async () => {
    await saveImmediate();
    skipUnmountSaveRef.current = true;
    onClose();
  };

  const pal = NOTE_PALETTE[color] ?? NOTE_PALETTE[0];
  const padTopWriting = 5;
  const padXWriting = 14;

  return (
    <div className="fixed inset-0 z-[55] flex items-end justify-center overflow-y-auto sm:items-center sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-black/35 backdrop-blur-[2px]"
        aria-label="Close"
        onClick={() => void handleClose()}
      />
      <div className="glass-modal relative z-10 flex max-h-[min(92dvh,880px)] w-full max-w-lg flex-col overflow-hidden rounded-t-[26px] p-0 sm:rounded-[26px]">
        <div className="shrink-0 space-y-5 p-8 pb-0">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-vault-muted">Note title</div>
              <input
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  scheduleSave();
                }}
                onBlur={() => void saveImmediate()}
                className="mt-2 w-full rounded-xl border border-black/[0.08] bg-white/95 px-4 py-2.5 text-[15px] font-semibold text-vault-text outline-none ring-apple-blue/25 focus:ring-2"
                placeholder="Untitled"
              />
            </div>
            <button
              type="button"
              title="Save and close"
              onClick={() => void handleClose()}
              className="shrink-0 rounded-full border-0 bg-apple-green px-6 py-2.5 text-[13px] font-semibold text-white shadow-[0_0_20px_rgba(52,199,89,0.48)] hover:bg-[#2eb350] hover:shadow-[0_0_24px_rgba(52,199,89,0.58)] focus:outline-none focus-visible:ring-2 focus-visible:ring-apple-green/65"
            >
              Done
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-2 pt-6">
        <label className="block text-[11px] font-semibold uppercase tracking-wide text-vault-muted">Folder</label>
        <select
          className="mt-2 w-full cursor-pointer rounded-xl border border-black/[0.08] bg-white/95 px-4 py-2.5 text-sm outline-none ring-apple-blue/25 focus:ring-2"
          value={String(folderId)}
          onChange={(e) => {
            const v = Number(e.target.value);
            setFolderId(v);
            scheduleSave();
          }}
        >
          {folders.map((f) => (
            <option key={f.id} value={String(f.id)}>
              {f.name}
            </option>
          ))}
        </select>

        <label className="mt-5 flex cursor-pointer items-center gap-3 text-sm font-medium text-vault-text">
          <input
            type="checkbox"
            checked={favorite}
            onChange={(e) => {
              setFavorite(e.target.checked);
              scheduleSave();
            }}
            className="h-4 w-4 shrink-0 rounded border-black/20 accent-apple-blue"
          />
          <span>Add to favorites</span>
        </label>

        <div className="mt-5">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-vault-muted">Paper color</div>
          <div className="flex flex-wrap gap-2">
            {NOTE_PALETTE.map((p, idx) => (
              <button
                key={String(idx)}
                type="button"
                title={`Color ${idx + 1}`}
                onClick={() => {
                  setColor(idx);
                  scheduleSave();
                }}
                className={`h-9 w-9 rounded-full border-2 shadow-sm transition ${
                  color === idx ? "border-apple-blue ring-2 ring-apple-blue/35" : "border-black/[0.08]"
                }`}
                style={{ backgroundColor: p.tint }}
              />
            ))}
          </div>
        </div>

        <div className="mt-6 flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-vault-muted">
            Writing
          </div>
          <div
            className="flex min-h-[min(48vh,420px)] flex-1 flex-col overflow-hidden rounded-2xl border border-black/[0.06] shadow-inner"
            style={{ backgroundColor: pal.tint }}
          >
            <textarea
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                scheduleSave();
              }}
              onBlur={() => void saveImmediate()}
              spellCheck={false}
              autoCorrect="off"
              placeholder="Only type on the ruled lines..."
              className="min-h-0 w-full min-w-0 flex-1 resize-y border-0 bg-transparent font-sans text-slate-800 outline-none [box-sizing:border-box] placeholder:text-slate-400/70 focus:ring-0"
              style={{
                fontSize: "14px",
                lineHeight: `${NOTE_LINE_PX}px`,
                padding: `${padTopWriting}px ${padXWriting}px ${padTopWriting + 2}px`,
                backgroundImage: `repeating-linear-gradient(transparent, transparent ${
                  NOTE_LINE_PX - 1
                }px, ${pal.line} ${NOTE_LINE_PX - 1}px, ${pal.line} ${NOTE_LINE_PX}px)`,
                backgroundSize: `100% ${NOTE_LINE_PX}px`,
                backgroundAttachment: "local",
              }}
            />
          </div>
          <p className="mt-2 text-[11px] text-vault-muted">
            Saves continuously while typing (Electron IPC). ⌘S / Ctrl+S saves now. Stored encrypted in SQLite with
            your vault.
          </p>
        </div>
        </div>

        <div className="shrink-0 border-t border-black/[0.06] px-8 py-5">
          <div className="flex justify-end">
            <button
              type="button"
              className="rounded-xl px-4 py-2.5 text-sm font-semibold text-apple-red hover:bg-red-500/10"
              onClick={() => onDeleteRequest?.()}
            >
              Delete note
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function LogoMark({ className = "" }) {
  return (
    <img
      src={BRAND_LOGO_SRC}
      alt=""
      draggable={false}
      className={`aspect-square shrink-0 select-none object-cover shadow-sm ${className} rounded-[23%]`}
      aria-hidden
    />
  );
}

function RailIconButton({ children, title, active, onClick }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`mb-2 flex h-11 w-11 items-center justify-center rounded-xl transition-colors duration-200 ${
        active ? "text-apple-blue" : "text-vault-muted hover:text-vault-text/85"
      }`}
    >
      {children}
    </button>
  );
}

function IconGrid() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function IconStarSoft() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" className="opacity-90">
      <path d="M12 2.5c.4 0 .8.2 1 .6l2.1 4.3 4.7.7c.5.1.9.5 1 1 .1.5-.1 1-.5 1.3l-3.4 3.3.8 4.7c.1.5-.1 1-.5 1.3-.4.3-1 .3-1.4 0L12 18.2 8.3 20.4c-.4.3-1 .2-1.4-.1-.4-.3-.6-.8-.5-1.3l.8-4.7-3.4-3.3c-.4-.3-.6-.8-.5-1.3.1-.5.5-.9 1-1l4.7-.7 2.1-4.3c.2-.4.6-.6 1-.6z" />
    </svg>
  );
}

function IconExtension() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function IconLock() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" strokeLinecap="round" />
    </svg>
  );
}

function IconNotes() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="3" width="16" height="18" rx="2.5" />
      <path d="M8 7.5h8M8 11h8M8 14.5h6" />
    </svg>
  );
}

function IconNotesLarge() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="3" width="16" height="18" rx="2.5" />
      <path d="M8 7.5h8M8 11h8M8 14.5h6" />
    </svg>
  );
}

function IconMonitorSmall({ className = "" }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8" />
      <path d="M12 17v4" />
    </svg>
  );
}

/** Push-pin / thumbtack — office pin, not a map location marker */
function IconPinSmall({ filled = false }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <circle
        cx="12"
        cy="7"
        r="3.25"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.75"
        opacity={filled ? 1 : 0.82}
      />
      <path
        d="M12 10v9.5"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      <path
        d="M7 22h10"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        opacity={0.9}
      />
    </svg>
  );
}

function IconCopyRounded() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" strokeLinecap="round" />
    </svg>
  );
}

function CredCard({ entry, onOpen, onToggleFav, onCopyUsername, onCopyPassword }) {
  const [copyMenuOpen, setCopyMenuOpen] = useState(false);
  const copyWrapRef = useRef(null);

  const host = hostFromUrl(entry.url);
  const updated = entry.updatedAt
    ? new Date(entry.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : "";

  const hasUsername = String(entry.username ?? "").trim().length > 0;
  const hasPassword = Boolean(entry.password);

  useEffect(() => {
    if (!copyMenuOpen) return undefined;
    const onDoc = (ev) => {
      if (copyWrapRef.current && !copyWrapRef.current.contains(ev.target)) {
        setCopyMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [copyMenuOpen]);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="glass-panel group flex w-full cursor-pointer flex-col rounded-2xl p-4 text-left outline-none ring-apple-blue/40 transition-[box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:shadow-float focus-visible:ring-2"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold leading-snug text-vault-text">
            {entry.title || "Login"}
          </div>
          <div className="mt-1 truncate text-[12px] text-vault-muted">
            {host || "No URL"} · {entry.username || "—"}
          </div>
          {entry.notes?.trim() ? (
            <p className="mt-2 line-clamp-3 text-[12px] leading-snug text-[#1b7f3a]">
              {truncateNote(entry.notes.trim(), 160)}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            title={entry.favorite ? "Remove from favorites" : "Add to favorites"}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFav(e);
            }}
            className={`rounded-full p-1.5 transition hover:bg-black/[0.05] ${
              entry.favorite ? "text-g-yellow" : "text-vault-muted"
            }`}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" className="drop-shadow-sm">
              <path d="M12 3.2c.35 0 .67.2.83.51l1.88 3.82 4.2.61c.92.13 1.29 1.27.62 1.92l-3.04 2.97.72 4.19c.16.92-.8 1.62-1.62 1.34L12 16.9l-3.76 1.98c-.82.27-1.78-.42-1.62-1.34l.72-4.19-3.04-2.97c-.67-.65-.3-1.79.62-1.92l4.2-.61 1.88-3.82c.16-.31.48-.51.83-.51z" />
            </svg>
          </button>
          <div ref={copyWrapRef} className="relative flex items-center">
            <button
              type="button"
              title="Copy username or password"
              disabled={!hasUsername && !hasPassword}
              onClick={(e) => {
                e.stopPropagation();
                if (!hasUsername && !hasPassword) return;
                setCopyMenuOpen((o) => !o);
              }}
              className={`rounded-full p-1.5 text-apple-blue transition hover:bg-apple-blue/10 disabled:cursor-not-allowed disabled:opacity-35 ${
                copyMenuOpen ? "bg-apple-blue/15" : ""
              }`}
              aria-expanded={copyMenuOpen}
              aria-haspopup="menu"
            >
              <IconCopyRounded />
            </button>
            {copyMenuOpen ? (
              <div
                role="menu"
                className="absolute right-0 top-full z-[70] mt-1 min-w-[11rem] overflow-hidden rounded-xl border border-black/[0.08] bg-white py-1 shadow-lg"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  role="menuitem"
                  disabled={!hasUsername}
                  className="flex w-full px-3 py-2 text-left text-[13px] font-medium text-vault-text transition hover:bg-black/[0.05] disabled:cursor-not-allowed disabled:opacity-35"
                  onClick={(e) => {
                    setCopyMenuOpen(false);
                    onCopyUsername(e);
                  }}
                >
                  Copy username
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={!hasPassword}
                  className="flex w-full px-3 py-2 text-left text-[13px] font-medium text-vault-text transition hover:bg-black/[0.05] disabled:cursor-not-allowed disabled:opacity-35"
                  onClick={(e) => {
                    setCopyMenuOpen(false);
                    onCopyPassword(e);
                  }}
                >
                  Copy password
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {(entry.categoryName || updated) ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-black/[0.06] pt-3">
          {entry.categoryName ? (
            <span className="rounded-full bg-black/[0.04] px-2.5 py-0.5 text-[11px] font-medium text-vault-muted">
              {entry.categoryName}
            </span>
          ) : null}
          {updated ? (
            <span className="text-[11px] text-vault-muted/80">Updated {updated}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function EmptyVaultState({ onAdd }) {
  return (
    <div className="glass-panel mx-auto mt-8 flex max-w-lg flex-col items-center rounded-[28px] px-10 py-16 text-center">
      <LogoMark className="h-16 w-16" />
      <h2 className="mt-6 text-lg font-semibold text-vault-text">Your vault is ready</h2>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-vault-muted">
        Save app names, logins, and secure notes. Use categories on the left and favorites for
        everyday sites.
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="mt-8 rounded-xl bg-apple-blue px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-apple-blue/25"
      >
        Add your first password
      </button>
    </div>
  );
}

function GlassConfirmDeleteModal({ kind, itemTitle, itemSubtitle, onCancel, onConfirm }) {
  const isNote = kind === "note";
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-5 sm:p-8">
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-md"
        aria-label="Cancel"
        onClick={onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="del-confirm-title"
        className="glass-modal relative z-10 w-full max-w-[420px] rounded-[22px] border border-white/35 bg-white/[0.72] p-8 shadow-[0_32px_120px_rgba(0,0,0,0.18)] backdrop-blur-xl"
      >
        <h2 id="del-confirm-title" className="text-lg font-semibold tracking-tight text-vault-text">
          {isNote ? "Delete this note?" : "Delete this login?"}
        </h2>
        <p className="mt-4 text-[16px] font-semibold leading-snug text-vault-text">{itemTitle}</p>
        {!isNote && itemSubtitle ? (
          <p className="mt-1.5 text-[13px] font-medium text-vault-muted">{itemSubtitle}</p>
        ) : null}
        <p className="mt-5 text-sm leading-relaxed text-vault-muted">
          {isNote
            ? "This notepad will be removed from your vault permanently."
            : "This password entry will be removed from your vault permanently."}
        </p>
        <div className="mt-8 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            className="rounded-xl px-5 py-2.5 text-sm font-medium text-vault-muted transition hover:bg-black/[0.05]"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-xl bg-apple-red px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-red-500/20 transition hover:bg-red-600"
            onClick={onConfirm}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function GlassDetailModal({
  cred,
  revealedPw,
  setRevealedPw,
  onClose,
  onEdit,
  onDeleteRequest,
  onCopyUsername,
  onCopyPassword,
  onToggleFav,
}) {
  const updated = cred.updatedAt
    ? new Date(cred.updatedAt).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="glass-modal relative z-10 w-full max-w-lg rounded-t-[28px] p-8 sm:rounded-[28px]">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-vault-muted">
              {cred.categoryName || "Uncategorized"}
            </div>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-vault-text">
              {cred.title || "Login"}
            </h2>
            <p className="mt-1 text-sm text-vault-muted">{hostFromUrl(cred.url) || "—"}</p>
          </div>
          <button
            type="button"
            title="Favorite"
            onClick={() => void onToggleFav()}
            className={`rounded-full p-2 transition hover:bg-black/[0.04] ${
              cred.favorite ? "text-g-yellow" : "text-vault-muted"
            }`}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3.2c.35 0 .67.2.83.51l1.88 3.82 4.2.61c.92.13 1.29 1.27.62 1.92l-3.04 2.97.72 4.19c.16.92-.8 1.62-1.62 1.34L12 16.9l-3.76 1.98c-.82.27-1.78-.42-1.62-1.34l.72-4.19-3.04-2.97c-.67-.65-.3-1.79.62-1.92l4.2-.61 1.88-3.82c.16-.31.48-.51.83-.51z" />
            </svg>
          </button>
        </div>

        <dl className="space-y-4 text-sm">
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-vault-muted">URL</dt>
            <dd className="mt-1 break-all text-vault-text">{cred.url || "—"}</dd>
          </div>
          <div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-vault-muted">
                Username
              </dt>
              <button
                type="button"
                disabled={!String(cred.username ?? "").trim()}
                className="text-[12px] font-medium text-apple-blue hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                onClick={() => onCopyUsername()}
              >
                Copy
              </button>
            </div>
            <dd className="mt-1 break-all font-medium">{cred.username || "—"}</dd>
          </div>
          <div>
            <dt className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-vault-muted">
                Password
              </span>
              <span className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={!cred.password}
                  className="text-[12px] font-medium text-apple-blue hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => onCopyPassword()}
                >
                  Copy
                </button>
                <button
                  type="button"
                  disabled={!cred.password}
                  className="text-[12px] font-medium text-apple-blue hover:underline disabled:opacity-40"
                  onClick={() => cred.password && setRevealedPw((x) => !x)}
                >
                  {revealedPw ? "Hide" : "Reveal"}
                </button>
              </span>
            </dt>
            <dd className="mt-1 font-mono text-sm">
              {revealedPw && cred.password ? cred.password : cred.password ? "••••••••••••" : "—"}
            </dd>
          </div>
          {cred.notes ? (
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-vault-muted">
                Notes
              </dt>
              <dd className="mt-2 whitespace-pre-wrap rounded-xl bg-black/[0.03] px-3 py-2 text-[13px] leading-relaxed text-vault-text">
                {cred.notes}
              </dd>
            </div>
          ) : null}
          {updated ? (
            <p className="pt-2 text-[12px] text-vault-muted/90">Modified {updated}</p>
          ) : null}
        </dl>

        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex flex-1 items-center justify-center rounded-xl border border-black/[0.1] bg-white px-5 py-2.5 text-sm font-semibold sm:flex-none"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={onDeleteRequest}
            className="rounded-xl px-5 py-2.5 text-sm font-semibold text-apple-red hover:bg-red-500/10"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function TokenMask() {
  const [text, setText] = useState("…");
  useEffect(() => {
    let ok = true;
    void (async () => {
      const t = await api.getExtensionToken();
      if (ok) setText(maskToken(t));
    })();
    return () => {
      ok = false;
    };
  }, []);
  return text;
}

function CredentialModal({ categories, initial, onClose, onSave, generatePassword }) {
  const [url, setUrl] = useState(initial.url || "");
  const [username, setUsername] = useState(initial.username || "");
  const [password, setPassword] = useState(initial.password || "");
  const [title, setTitle] = useState(initial.appName ?? initial.titleRaw ?? "");
  const [notes, setNotes] = useState(initial.notes || "");
  const [favorite, setFavorite] = useState(!!initial.favorite);
  const [categoryId, setCategoryId] = useState(
    initial.categoryId ?? categories[0]?.id ?? ""
  );
  const isEdit = Boolean(initial.id);

  useEffect(() => {
    setUrl(initial.url || "");
    setUsername(initial.username || "");
    setPassword(initial.password || "");
    setTitle(initial.appName ?? initial.titleRaw ?? "");
    setNotes(initial.notes || "");
    setFavorite(!!initial.favorite);
    setCategoryId(initial.categoryId ?? categories[0]?.id ?? "");
  }, [initial, categories]);

  return (
    <div className="fixed inset-0 z-50 flex min-h-0 items-end justify-center overflow-hidden sm:items-center sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cred-modal-title"
        className="glass-modal relative z-10 flex max-h-[min(92dvh,44rem)] w-full max-w-lg min-w-0 flex-col overflow-hidden rounded-t-[28px] sm:mx-4 sm:my-auto sm:max-h-[min(92dvh,52rem)] sm:rounded-[28px]"
      >
        <div className="border-b border-black/[0.06] px-8 pb-4 pt-8 sm:border-0 sm:pb-0">
          <h2 id="cred-modal-title" className="text-lg font-semibold">
            {isEdit ? "Edit password" : "New password"}
          </h2>
          <p className="mt-1 text-sm text-vault-muted">App identity, credentials, optional notes.</p>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overflow-x-hidden px-8 py-5 sm:pt-4">
          <div className="flex min-w-0 flex-col gap-2">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-vault-muted">
              App name
            </label>
            <input
              className="w-full min-w-0 rounded-xl border border-black/[0.08] bg-white/95 px-4 py-3 text-sm outline-none ring-apple-blue/20 placeholder:text-vault-muted/70 focus:ring-2"
              placeholder="e.g. Spotify, Banking"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-vault-muted">
              Category
            </label>
            <select
              className="w-full min-w-0 cursor-pointer rounded-xl border border-black/[0.08] bg-white/95 px-4 py-3 text-sm outline-none ring-apple-blue/20 focus:ring-2"
              value={String(categoryId)}
              onChange={(e) => setCategoryId(Number(e.target.value))}
            >
              {categories.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-vault-muted">
              Website URL
            </label>
            <input
              className="w-full min-w-0 rounded-xl border border-black/[0.08] bg-white/95 px-4 py-3 text-sm outline-none ring-apple-blue/20 placeholder:text-vault-muted/70 focus:ring-2"
              placeholder="https://..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-vault-muted">
              Username / email
            </label>
            <input
              className="w-full min-w-0 rounded-xl border border-black/[0.08] bg-white/95 px-4 py-3 text-sm outline-none ring-apple-blue/20 placeholder:text-vault-muted/70 focus:ring-2"
              placeholder="you@company.com"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:gap-3">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-vault-muted">
                Password
              </label>
              <input
                type="password"
                className="w-full min-w-0 rounded-xl border border-black/[0.08] bg-white/95 px-4 py-3 font-mono text-sm outline-none ring-apple-blue/20 placeholder:text-vault-muted/70 focus:ring-2"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <button
              type="button"
              title="Generate strong password"
              className="h-11 shrink-0 self-stretch rounded-xl border border-g-green/40 bg-g-green/10 px-4 text-xs font-semibold text-[#1e6b32] transition hover:bg-g-green/15 sm:h-11 sm:self-auto sm:px-3"
              onClick={() => setPassword(generatePassword(20))}
            >
              Generate
            </button>
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-vault-muted">
              Notes <span className="font-normal text-vault-muted/70">(PIN hints, backup codes)</span>
            </label>
            <textarea
              className="min-h-[5rem] max-h-[min(32vh,14rem)] w-full min-w-0 resize-y rounded-xl border border-black/[0.08] bg-white/95 px-4 py-3 text-sm outline-none ring-apple-blue/20 placeholder:text-vault-muted/70 focus:ring-2"
              placeholder="Optional secure note"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <label className="flex shrink-0 cursor-pointer items-center gap-3 text-sm font-medium">
            <input
              type="checkbox"
              checked={favorite}
              onChange={(e) => setFavorite(e.target.checked)}
              className="h-4 w-4 shrink-0 rounded border-black/20 accent-apple-blue"
            />
            <span>Add to favorites</span>
          </label>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-black/[0.06] bg-white/[0.4] px-8 py-4 backdrop-blur-[2px] sm:bg-transparent sm:backdrop-blur-none">
          <button
            type="button"
            className="rounded-xl px-5 py-2.5 text-sm font-medium text-vault-muted hover:bg-black/[0.04]"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-xl bg-apple-blue px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-apple-blue/20"
            onClick={() =>
              onSave({
                id: initial.id,
                categoryId: Number(categoryId),
                url,
                username,
                password,
                favorite,
                title: title.trim(),
                notes: notes.trim(),
              })
            }
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
