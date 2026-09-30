import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Magnetic, SplitReveal, Spotlight, useLenis } from "./motion.jsx";
import authArtSanctuary from "./anime-vault-sanctuary.jpg";
import dashBannerArt from "./anime-dashboard-banner.jpg";

const api = typeof window !== "undefined" ? window.vaultApi : undefined;

function maskToken(t) {
  if (!t || typeof t !== "string") return "—";
  return `${t.slice(0, 8)}…${t.slice(-4)}`;
}

function hostFromUrl(u) {
  if (!u || typeof u !== "string") return "";
  try {
    const raw = u.trim();
    const hasProto = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw);
    const parsed = new URL(hasProto ? raw : `https://${raw}`);
    const host = parsed.hostname.replace(/^www\./i, "");
    return decodeURIComponent(host);
  } catch {
    try {
      return decodeURIComponent(u.trim().replace(/^www\./i, ""));
    } catch {
      return u.trim();
    }
  }
}

function formatDisplayName(entry) {
  if (!entry) return "Untitled login";
  if (entry.title && entry.title.trim()) {
    try {
      return decodeURIComponent(entry.title.trim());
    } catch {
      return entry.title.trim();
    }
  }
  if (entry.url && entry.url.trim()) {
    try {
      const u = entry.url.trim();
      const host = hostFromUrl(u);
      if (host) return decodeURIComponent(host);
      return decodeURIComponent(u);
    } catch {
      return entry.url.trim();
    }
  }
  return "Untitled login";
}

function truncateNote(s, maxLen) {
  const t = (s || "").trim();
  if (!t) return "";
  return t.length > maxLen ? `${t.slice(0, maxLen)}…` : t;
}

function formatRelativeTime(ts) {
  if (!ts) return "Recently";
  const diffSec = Math.floor((Date.now() - Number(ts)) / 1000);
  if (diffSec < 60) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffDays = Math.floor(diffH / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatUserNameFromEmail(email) {
  if (!email || typeof email !== "string") return "Personal";
  const raw = email.split("@")[0].trim();
  if (!raw) return "Personal";
  if (raw.toLowerCase() === "abhinavsilwal") return "Abhinav Silwal";
  if (/[._-]/.test(raw)) {
    return raw
      .split(/[._-]+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  }
  return raw.charAt(0).toUpperCase() + raw.slice(1);
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
  { tint: "#141a16", line: "rgba(216, 178, 92, 0.10)" },
  { tint: "#12181f", line: "rgba(127, 168, 201, 0.12)" },
  { tint: "#1a1420", line: "rgba(216, 178, 92, 0.10)" },
  { tint: "#1d1712", line: "rgba(201, 138, 94, 0.12)" },
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

/** Aurora: three blurred, slowly drifting colour blobs behind the app. */
function Aurora() {
  return (
    <div className="aurora" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}

/** Word-by-word headline: words fade up from blur with a staggered delay. */
function WordReveal({ text, className = "" }) {
  const words = String(text).split(" ");
  return (
    <span className={`word-reveal ${className}`} aria-label={text}>
      {words.map((w, i) => (
        <span key={`${i}-${w}`} className="w" style={{ "--i": i }} aria-hidden="true">
          {w}
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </span>
  );
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
    <header className="relative z-30 flex h-11 shrink-0 items-stretch">
      <div
        className="flex min-w-0 flex-1 items-center gap-2 px-3 py-1"
        style={{ WebkitAppRegion: "drag" }}
        onDoubleClick={() => void api.winToggleMaximize?.()}
      >
        <LogoMark className="h-4 w-4 shrink-0" />
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold leading-tight tracking-tight text-slate-800">
            {title}
          </div>
          {subtitle ? (
            <div className="truncate text-[11px] leading-tight text-slate-400">{subtitle}</div>
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
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 transition-all duration-200 ease-vault hover:bg-black/[0.06] hover:text-slate-900 active:scale-[0.94]"
        >
          <IconTitleMinimize />
        </button>
        <button
          type="button"
          title={maximized ? "Restore" : "Maximize"}
          aria-label={maximized ? "Restore" : "Maximize"}
          onClick={() => void api.winToggleMaximize?.()}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 transition-all duration-200 ease-vault hover:bg-black/[0.06] hover:text-slate-900 active:scale-[0.94]"
        >
          {maximized ? <IconTitleRestore /> : <IconTitleMaximize />}
        </button>
        <button
          type="button"
          title="Close"
          aria-label="Close"
          onClick={() => void api.winClose?.()}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-vault-muted transition-all duration-200 ease-vault hover:bg-vault-danger hover:text-white active:scale-[0.94]"
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
    <div className="grain flex h-screen flex-col overflow-hidden">
      <a href="#vault-content" className="skip-link">
        Skip to vault content
      </a>
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
        className="absolute inset-0 bg-black/60 backdrop-blur-md"
        aria-label="Dismiss update dialog"
        onClick={onDecline}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="glass-modal animate-vault-modal relative z-10 w-full max-w-[420px] rounded-[28px] p-8"
      >
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-vault-accentDeep">New release</div>
        <h2 className="font-display mt-2 text-2xl font-semibold tracking-tight text-vault-text">A fresher Myvault is here</h2>
        <p className="mt-4 text-sm leading-relaxed text-vault-muted">
          <span className="font-semibold text-vault-text">{version}</span>
          {releaseName ? <> · {releaseName}</> : null}
        </p>
        {releaseDateLabel ? (
          <p className="mt-2 text-[12px] text-vault-muted">Published {releaseDateLabel}</p>
        ) : null}
        <div className="mt-8 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-5 py-2.5 text-sm font-medium text-slate-700 transition"
            onClick={onDecline}
          >
            Not now
          </button>
          <button
            type="button"
            className="rounded-xl bg-[#121212] hover:bg-black px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition active:scale-[0.98]"
            onClick={onUpdate}
          >
            Update Myvault
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
        className="absolute inset-0 bg-black/60 backdrop-blur-md"
        aria-label="Dismiss"
        onClick={onLater}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="glass-modal animate-vault-modal relative z-10 w-full max-w-[420px] rounded-[28px] p-8"
      >
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Update ready</div>
        <h2 className="font-display mt-2 text-2xl font-semibold tracking-tight text-slate-900">Restart to finish</h2>
        <p className="mt-4 text-sm leading-relaxed text-slate-600">
          Version <span className="font-semibold text-slate-900">{version}</span> is downloaded and verified.
          One quick restart switches you to the fresh version.
        </p>
        <div className="mt-8 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-5 py-2.5 text-sm font-medium text-slate-700 transition"
            onClick={onLater}
          >
            Later
          </button>
          <button
            type="button"
            className="rounded-xl bg-[#121212] hover:bg-black px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition active:scale-[0.98]"
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
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [authModeOverride, setAuthModeOverride] = useState(null); // 'unlock' | 'create' | null
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
  const [compactMode, setCompactModeState] = useState(false);
  const [miniCollapsed, setMiniCollapsed] = useState(false);
  useLenis(true);

  const setPinnedAndSync = useCallback((v) => {
    const next = !!v;
    setVaultPinnedFront(next);
    if (typeof api?.setMainAlwaysOnTop === "function") {
      void api.setMainAlwaysOnTop(next);
    }
  }, []);

  const setCompact = useCallback(async (v) => {
    const next = !!v;
    if (typeof api?.setCompactMode === "function") {
      const r = await api.setCompactMode(next);
      if (r && r.ok === false) return;
    }
    if (!next) setVaultPinnedFront(false);
    setMiniCollapsed(false);
    setCompactModeState(next);
  }, []);

  // Collapsing keeps the bar on screen and pinned above other apps.
  const collapseMini = useCallback(async (v) => {
    const next = !!v;
    setMiniCollapsed(next);
    if (next) setVaultPinnedFront(true);
    await api.setMiniCollapsed?.(next);
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

  /** Extension POST /api/credentials completes in main — refresh vault list without restart */
  useEffect(() => {
    if (!unlocked || typeof api?.onCredentialsChanged !== "function") return undefined;
    return api.onCredentialsChanged(() => {
      void refreshList().then((list) => {
        setDetailCred((cur) => {
          if (!cur || !list) return cur;
          const u = list.find((x) => x.id === cur.id);
          return u || cur;
        });
      });
    });
  }, [unlocked, refreshList]);

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
        if (typeof api.getRegistrationMail === "function") {
          try {
            const rm = await api.getRegistrationMail();
            if (rm) setAccountEmail(rm);
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
    if (pane === "extension") return "Browser bridge";
    if (pane === "notes") {
      if (noteFolderFilter != null) {
        const f = noteFolders.find((x) => x.id === noteFolderFilter);
        return f ? f.name : "Private notes";
      }
      return "Private notes";
    }
    if (pane === "favorites") return "Starred items";
    if (categoryFilter != null) {
      const c = categories.find((x) => x.id === categoryFilter);
      return c ? c.name : "Category";
    }
    return "Login library";
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

  /** Sidebar omits General; edit forms omit General but items may still resolve there in DB */
  const categoriesSidebar = useMemo(
    () => categories.filter((c) => String(c.name).toLowerCase() !== "general"),
    [categories]
  );

  /** Category pickers inside forms (omit system "General" like sidebar) */
  const categoriesForm = categoriesSidebar;

  const generalCategoryId = useMemo(
    () => categories.find((c) => String(c.name).toLowerCase() === "general")?.id ?? null,
    [categories]
  );

  const inboxFolderId = useMemo(
    () =>
      noteFolders.find((f) => String(f.name).toLowerCase() === "inbox")?.id ?? null,
    [noteFolders]
  );

  /** Note folder dropdown: omit Inbox; if nothing else remains, fall back so the select stays valid */
  const noteFoldersSelectable = useMemo(() => {
    if (noteFolders.length === 0) return [];
    if (inboxFolderId == null) return noteFolders;
    const filtered = noteFolders.filter((f) => f.id !== inboxFolderId);
    return filtered.length > 0 ? filtered : noteFolders;
  }, [noteFolders, inboxFolderId]);

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
      if (typeof api.getRegistrationMail === "function") {
        try {
          const rm = await api.getRegistrationMail();
          if (rm) setAccountEmail(rm);
        } catch {
          //
        }
      }
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
      if (mail) setAccountEmail(mail);
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
    if (compactMode) void setCompact(false);
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
    const nonInbox = noteFolders.filter((f) => String(f.name).toLowerCase() !== "inbox");
    let fid =
      noteFolderFilter != null ? noteFolderFilter : nonInbox[0]?.id ?? noteFolders[0]?.id;
    if (
      fid != null &&
      inboxFolderId != null &&
      Number(fid) === Number(inboxFolderId) &&
      nonInbox.length > 0
    ) {
      fid = nonInbox[0].id;
    }
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
    const vis = categories.filter((c) => String(c.name).toLowerCase() !== "general");
    const gid =
      categoryFilter != null && vis.some((c) => c.id === categoryFilter)
        ? categoryFilter
        : vis[0]?.id ?? categories[0]?.id;
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
      <div className="flex h-screen items-center justify-center bg-vault-bg p-8 font-sans text-vault-danger">
        Run inside Electron with preload.
      </div>
    );
  }

  if (checking) {
    return (
      <WindowShell>
        <div className="relative flex h-full items-center justify-center overflow-hidden bg-vault-bg font-sans text-vault-text">
          <Aurora />
          <div className="relative flex flex-col items-center gap-4">
            <LogoMark className="h-12 w-12 shadow-soft" />
            <span className="text-sm font-medium text-vault-muted">Waking up your vault…</span>
          </div>
        </div>
      </WindowShell>
    );
  }

  if (bootError) {
    return (
      <WindowShell>
        <div className="relative flex h-full flex-col items-center justify-center gap-4 overflow-hidden bg-vault-bg p-10 font-sans text-vault-danger">
          <Aurora />
          <div className="relative text-lg font-semibold">Startup error</div>
          <pre className="relative max-w-xl whitespace-pre-wrap text-sm">{bootError}</pre>
        </div>
      </WindowShell>
    );
  }

  const isCreateMode = authModeOverride ? authModeOverride === "create" : !vaultExists;

  if (!unlocked) {
    return (
      <WindowShell>
        <div className="relative flex h-full min-h-0 items-center justify-center overflow-auto bg-white p-4 sm:p-8 lg:p-12 font-sans">
          <Aurora />
          
          <div className="relative grid w-full max-w-5xl overflow-hidden rounded-[36px] border border-slate-200/90 bg-white shadow-lift lg:grid-cols-[1fr_1.1fr]">
            {/* Form Column - Left */}
            <div className="flex flex-col justify-center px-8 py-10 sm:px-12 lg:px-14">
              {/* Brand Logo & Name */}
              <div className="mb-6 flex items-center gap-2.5">
                <LogoMark className="h-7 w-7" />
                <span className="text-xl font-bold tracking-tight text-slate-900">Myvault</span>
              </div>

              {/* Title & Subtitle */}
              <div>
                <div className="mb-2.5 inline-flex items-center gap-1.5 rounded-full border border-orange-500/20 bg-orange-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-orange-600">
                  ✦ Zero-Knowledge Vault
                </div>
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                  {isCreateMode ? "Create an account" : "Sign in"}
                </h1>
                <p className="mt-2 text-sm text-slate-500">
                  {isCreateMode
                    ? "Set your master credentials to initialize your encrypted sanctuary."
                    : "Use the master password to access your Myvault."}
                </p>
              </div>

              <form
                className="mt-8 block w-full"
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  if (busy) return;
                  void (isCreateMode ? handleCreateVault() : handleUnlock());
                }}
              >
                {isCreateMode ? (
                  <>
                    <label className="block text-xs font-semibold text-slate-700">
                      Work email
                      {!supabaseRegistration.configured ? (
                        <span className="ml-1 font-normal text-slate-400">(optional)</span>
                      ) : (
                        <span className="text-rose-500"> *</span>
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
                        if (!busy) void handleCreateVault();
                      }}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder-slate-400 shadow-sm transition focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                    />

                    <label className="mt-4 block text-xs font-semibold text-slate-700">
                      Master password
                    </label>
                    <div className="relative mt-1.5">
                      <input
                        type={showCreateMp ? "text" : "password"}
                        autoComplete="new-password"
                        placeholder="At least 8 characters"
                        value={mp}
                        onChange={(e) => setMp(e.target.value)}
                        onKeyUp={(e) => setCapsLockOn(e.getModifierState?.("CapsLock") ?? false)}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter") return;
                          e.preventDefault();
                          if (!busy) void handleCreateVault();
                        }}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 pr-11 text-sm font-mono text-slate-900 placeholder-slate-400 shadow-sm transition focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                      />
                      <button
                        type="button"
                        aria-label={showCreateMp ? "Hide password" : "Show password"}
                        onClick={() => setShowCreateMp((v) => !v)}
                        className="absolute right-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:text-slate-700"
                      >
                        {showCreateMp ? <IconVisibilityClosed /> : <IconVisibilityOpen />}
                      </button>
                    </div>

                    <label className="mt-4 block text-xs font-semibold text-slate-700">
                      Confirm master password
                    </label>
                    <div className="relative mt-1.5">
                      <input
                        type={showConfirmMpVis ? "text" : "password"}
                        autoComplete="new-password"
                        placeholder="Repeat master password"
                        value={confirmMp}
                        onChange={(e) => setConfirmMp(e.target.value)}
                        onKeyUp={(e) => setCapsLockOn(e.getModifierState?.("CapsLock") ?? false)}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter") return;
                          e.preventDefault();
                          if (!busy) void handleCreateVault();
                        }}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 pr-11 text-sm font-mono text-slate-900 placeholder-slate-400 shadow-sm transition focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                      />
                      <button
                        type="button"
                        aria-label={showConfirmMpVis ? "Hide password" : "Show password"}
                        onClick={() => setShowConfirmMpVis((v) => !v)}
                        className="absolute right-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:text-slate-700"
                      >
                        {showConfirmMpVis ? <IconVisibilityClosed /> : <IconVisibilityOpen />}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-semibold text-slate-700">
                        Master password
                      </label>
                      <span className="font-mono text-[11px] text-slate-400">Press ↵ to sign in</span>
                    </div>
                    <div className="relative mt-1.5">
                      <input
                        autoFocus
                        type={showUnlockPw ? "text" : "password"}
                        autoComplete="current-password"
                        placeholder="Enter master password"
                        value={mp}
                        onChange={(e) => setMp(e.target.value)}
                        onKeyUp={(e) => setCapsLockOn(e.getModifierState?.("CapsLock") ?? false)}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter") return;
                          e.preventDefault();
                          if (!busy) void handleUnlock();
                        }}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 pr-11 text-sm font-mono text-slate-900 placeholder-slate-400 shadow-sm transition focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                      />
                      <button
                        type="button"
                        aria-label={showUnlockPw ? "Hide password" : "Show password"}
                        onClick={() => setShowUnlockPw((v) => !v)}
                        className="absolute right-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:text-slate-700"
                      >
                        {showUnlockPw ? <IconVisibilityClosed /> : <IconVisibilityOpen />}
                      </button>
                    </div>
                  </>
                )}

                {capsLockOn && (
                  <div className="mt-2.5 flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800">
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    Caps Lock is ON
                  </div>
                )}

                {formError && (
                  <p className="mt-3.5 rounded-xl border border-rose-500/30 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700">
                    {formError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="mt-6 w-full rounded-xl bg-[#121212] hover:bg-black py-3.5 text-sm font-semibold text-white shadow-sm transition active:scale-[0.99] disabled:opacity-50"
                >
                  {busy
                    ? "Decrypting Enclave…"
                    : isCreateMode
                    ? "Create account"
                    : "Sign in"}
                </button>

                {/* Footer mode toggle matching Screenshot 1 */}
                <div className="mt-6 text-center text-xs text-slate-500">
                  {isCreateMode ? (
                    <>
                      Already have a vault?{" "}
                      <button
                        type="button"
                        onClick={() => {
                          setFormError(null);
                          setAuthModeOverride("unlock");
                        }}
                        className="font-semibold text-orange-600 hover:text-orange-700 hover:underline"
                      >
                        Sign in
                      </button>
                    </>
                  ) : (
                    <>
                      New to Myvault?{" "}
                      <button
                        type="button"
                        onClick={() => {
                          setFormError(null);
                          setAuthModeOverride("create");
                        }}
                        className="font-semibold text-orange-600 hover:text-orange-700 hover:underline"
                      >
                        Create an account
                      </button>
                    </>
                  )}
                </div>

                {vaultExists && (
                  <button
                    type="button"
                    onClick={() => {
                      setRecoverModalOpen(true);
                      setRecoveryError(null);
                    }}
                    className="mt-3 block w-full text-center text-xs text-slate-400 transition hover:text-orange-600"
                  >
                    Forgot master password? Recover vault
                  </button>
                )}
              </form>
            </div>

            {/* Anime Visual Column - Right (matches user screenshot 1!) */}
            <div className="relative hidden lg:flex flex-col items-center justify-center p-3.5">
              <div className="relative h-full w-full min-h-[580px] overflow-hidden rounded-[30px] bg-gradient-to-b from-orange-50/50 to-amber-50/30 shadow-inner">
                <img
                  src={authArtSanctuary}
                  alt="Myvault Anime Sanctuary"
                  className="h-full w-full object-cover object-center"
                />
                {/* Soft anime white mist at the bottom matching reference */}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-white via-white/50 to-transparent" />

                {/* Anime solarpunk status pill */}
                <div className="pointer-events-none absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-white/60 bg-white/80 px-3 py-1 text-[11px] font-semibold text-slate-800 shadow-sm backdrop-blur-md">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  Enclave Armed
                </div>
              </div>
            </div>
          </div>
        {recoverModalOpen ? (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-5">
            <button
              type="button"
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
              aria-label="Close reset dialog"
              onClick={closeRecoveryModal}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="reset-pw-title"
              className="glass-modal animate-vault-modal relative z-10 flex w-full max-w-md flex-col gap-3 rounded-[28px] p-8"
            >
              <div className="text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-vault-accentDeep">
                Recovery protocol
              </div>
              <div
                id="reset-pw-title"
                className="font-display text-center text-2xl font-semibold tracking-tight text-vault-text"
              >
                Reset your password
              </div>
              <p className="text-center text-[13px] leading-relaxed text-vault-muted">
                Paste your emergency encryption recovery key, then choose a fresh master password.
              </p>
              <label className="mt-2 block text-[10px] font-semibold uppercase tracking-[0.08em] text-vault-muted">
                Encryption recovery key
              </label>
              <input
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={recoveryKeyPlain}
                onChange={(e) => setRecoveryKeyPlain(e.target.value)}
                placeholder="Paste full 64-character key"
                className="vault-input font-mono text-xs"
              />
              <label className="mt-2 block text-[10px] font-semibold uppercase tracking-[0.08em] text-vault-muted">
                New master password
              </label>
              <input
                type="password"
                autoComplete="new-password"
                value={recoveryNewPw}
                onChange={(e) => setRecoveryNewPw(e.target.value)}
                placeholder="At least 8 characters"
                className="vault-input text-sm"
              />
              <label className="mt-2 block text-[10px] font-semibold uppercase tracking-[0.08em] text-vault-muted">
                Confirm new password
              </label>
              <input
                type="password"
                autoComplete="new-password"
                value={recoveryConfirmPw}
                onChange={(e) => setRecoveryConfirmPw(e.target.value)}
                placeholder="Repeat password"
                className="vault-input text-sm"
              />
              {recoveryError ? (
                <p className="rounded-xl border border-vault-danger/30 bg-vault-danger/10 px-3.5 py-2.5 text-xs font-medium text-vault-danger">{recoveryError}</p>
              ) : null}
              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  disabled={recoveryBusy}
                  onClick={closeRecoveryModal}
                  className="flex-1 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 py-2.5 text-sm font-medium text-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={recoveryBusy}
                  onClick={() => void handleRecoveryConfirm()}
                  className="flex-1 rounded-xl bg-[#121212] hover:bg-black py-2.5 text-sm font-semibold text-white shadow-sm transition active:scale-[0.98] disabled:opacity-50"
                >
                  {recoveryBusy ? "Working…" : "Reset password"}
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

  if (unlocked && compactMode) {
    return (
      <MiniVault
        items={items}
        pinned={vaultPinnedFront}
        collapsed={miniCollapsed}
        onCollapse={() => void collapseMini(true)}
        onRestore={() => void collapseMini(false)}
        onTogglePin={() => setPinnedAndSync(!vaultPinnedFront)}
        onExpand={() => void setCompact(false)}
        onCopy={(entry) => {
          if (!entry.password) return;
          void api.copyToClipboard(entry.password, 30000);
          showToast("Password copied");
          void api.pingActivity();
        }}
        onNotify={showToast}
        toast={toast}
      />
    );
  }

  const sidebarOccupiedPx = 240;
  const gapBeforeContentPx = 16;
  const mainPadLeft = sidebarOccupiedPx + gapBeforeContentPx + 16;

  const hasWinChrome = typeof api?.winMinimize === "function";
  const railTopClass = hasWinChrome ? "top-[60px]" : "top-4";
  const railHeightClass = hasWinChrome ? "h-[calc(100vh-76px)]" : "h-[calc(100vh-32px)]";

  return (
    <WindowShell>
    <div className="vault-app relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-white font-sans text-vault-text">
      <Aurora />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_45%_at_100%_100%,rgba(249,115,22,0.06),transparent_60%)]" />

      <div className="vault-layout relative flex min-h-0 flex-1" style={{ paddingLeft: mainPadLeft }}>
        <div className={`pointer-events-none fixed left-4 z-40 flex ${railTopClass} ${railHeightClass}`}>
          <nav
            aria-label="Vault navigation"
            className="pointer-events-auto flex w-[240px] flex-col justify-between overflow-hidden rounded-[24px] border border-slate-200/90 bg-white p-3.5 shadow-sm"
          >
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {/* Brand Logo & Name matching Reference */}
              <div className="flex items-center gap-2.5 px-2 py-1">
                <LogoMark className="h-6 w-6" />
                <span className="text-base font-bold tracking-tight text-slate-900">Myvault</span>
              </div>

              {/* Workspace Selector */}
              <div className="mt-3 flex items-center justify-between rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 py-2 text-xs font-semibold text-slate-800">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="h-2 w-2 rounded-full bg-orange-500 shrink-0" />
                  <span className="truncate">{formatUserNameFromEmail(accountEmail)}'s vault</span>
                </div>
                <span className="text-[11px] text-slate-400">↕</span>
              </div>

              {/* Action button */}
              <button
                type="button"
                onClick={openAddCredential}
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#121212] hover:bg-black py-2.5 text-xs font-semibold text-white shadow-sm transition active:scale-[0.98]"
              >
                <span className="text-sm font-bold leading-none">+</span>
                <span>New login</span>
              </button>

              {/* Navigation list */}
              <div className="mt-4 space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    setPane("items");
                    setCategoryFilter(null);
                    void api.pingActivity();
                  }}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium transition ${
                    pane === "items" && categoryFilter == null
                      ? "bg-slate-100 font-semibold text-slate-900"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <IconGrid />
                  <span>All logins</span>
                  <span className="ml-auto text-[11px] font-mono text-slate-400">{items.length}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCategoryFilter(null);
                    setPane("favorites");
                    void api.pingActivity();
                  }}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium transition ${
                    pane === "favorites"
                      ? "bg-slate-100 font-semibold text-slate-900"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <IconStarSoft />
                  <span>Favorites</span>
                  {favoritesDashboardRows.length > 0 ? (
                    <span className="ml-auto text-[11px] font-mono text-slate-400">
                      {favoritesDashboardRows.length}
                    </span>
                  ) : null}
                </button>
              </div>

              {/* Section: Categories */}
              <div className="mt-6 border-t border-slate-100 pt-4 flex-1 min-h-0 flex flex-col">
                <div className="flex items-center justify-between px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <span>Categories</span>
                  <button
                    type="button"
                    onClick={() => {
                      setCategoryModal(true);
                      setNewCatName("");
                    }}
                    className="flex h-5 w-5 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-900 transition text-sm font-bold"
                    title="Add category"
                  >
                    +
                  </button>
                </div>

                <div className="mt-2.5 space-y-1 overflow-y-auto pr-1 flex-1">
                  <button
                    type="button"
                    onClick={() => {
                      setCategoryFilter(null);
                      setPane("items");
                      void api.pingActivity();
                    }}
                    className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs transition ${
                      categoryFilter == null && pane === "items"
                        ? "bg-slate-100 font-semibold text-slate-900"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    }`}
                  >
                    <span className="text-[10px] text-orange-500">✦</span>
                    <span className="truncate">All logins</span>
                    <span className="ml-auto text-[11px] font-mono text-slate-400">{items.length}</span>
                  </button>
                  {categoriesSidebar.map((c) => (
                    <div
                      key={c.id}
                      className={`group/item flex items-center justify-between rounded-xl px-2.5 py-1.5 text-xs transition ${
                        categoryFilter === c.id && pane === "items"
                          ? "bg-slate-100 font-semibold text-slate-900"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setCategoryFilter(c.id);
                          setPane("items");
                          void api.pingActivity();
                        }}
                        className="truncate flex-1 text-left"
                      >
                        {c.name}
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeCategory(c)}
                        className="opacity-0 group-hover/item:opacity-100 text-slate-400 hover:text-rose-500 px-1 transition text-sm"
                        title={`Delete ${c.name}`}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Bottom Profile Row */}
            <div className="border-t border-slate-100 pt-3">
              <div className="flex items-center justify-between gap-2 px-1">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-amber-600 text-xs font-bold text-white shadow-sm ring-2 ring-orange-500/20">
                    {formatUserNameFromEmail(accountEmail).charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold text-slate-800">
                      {formatUserNameFromEmail(accountEmail)}
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] font-medium text-emerald-600 leading-none">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Enclave Armed
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  title="Lock vault"
                  onClick={() => void handleLock()}
                  className="rounded-lg p-1.5 text-slate-400 transition hover:bg-orange-50 hover:text-orange-600"
                >
                  <IconLock />
                </button>
              </div>
            </div>
          </nav>
        </div>

        <main id="vault-content" className="vault-workspace relative flex min-w-0 flex-1 flex-col pl-0 pr-6 pt-7 pb-8 lg:pr-8">
          {pane === "extension" ? (
            <>
              <header className="mb-6 flex items-center gap-4">
                <h1
                  key={headerTitle}
                  className="animate-vault-header text-[11px] font-semibold uppercase tracking-[0.12em] text-vault-accentDeep"
                >
                  {headerTitle}
                </h1>
              </header>
              <div className="max-w-2xl space-y-6 text-sm">
                <p className="max-w-xl text-[15px] leading-relaxed text-vault-muted">
                  Connect your browser once, then save and fill credentials without leaving your flow.
                </p>
                <div className="glass-panel rounded-[26px] p-6">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-vault-accentDeep">
                    API base URL
                  </div>
                  <code className="mt-2 block break-all rounded-xl bg-vault-accentSoft/45 px-3 py-2 text-[13px] text-vault-accentDeep">
                    {apiBaseUrl}
                  </code>
                  <div className="mt-6 text-[11px] font-semibold uppercase tracking-[0.1em] text-vault-accentDeep">
                    Bearer token
                  </div>
                  <div className="mt-2 rounded-xl bg-vault-accentSoft/45 px-3 py-3 font-mono text-xs text-vault-text">
                    <TokenMask />
                  </div>
                  <div className="mt-6 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-secondary px-4 py-2 text-xs"
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
                      className="btn-secondary px-4 py-2 text-xs"
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
                <div className="glass-panel rounded-[26px] p-6">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-vault-accentDeep">
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
                        className="btn-secondary px-4 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
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
                      <div className="h-2 overflow-hidden rounded-full bg-vault-accentSoft/70">
                        <div
                          className="h-2 rounded-full bg-vault-accent transition-[width] duration-300"
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
                    <div className="mt-5 rounded-2xl border border-vault-accent/20 bg-vault-accentSoft/35 px-4 py-3 shadow-sm backdrop-blur-sm">
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
                            className="rounded-xl bg-[#121212] hover:bg-black px-4 py-2 text-xs font-semibold text-white shadow-sm transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={() => void beginUpdaterDownload()}
                          >
                            {updaterDlBusy ? "Downloading…" : "Download & update"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={typeof api?.quitAndInstallUpdate !== "function"}
                            className="rounded-xl bg-[#121212] hover:bg-black px-4 py-2 text-xs font-semibold text-white shadow-sm transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
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
              <header className="mb-7 flex flex-wrap items-end gap-4">
                <div>
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.13em] text-vault-accentDeep">Private writing space</div>
                  <h1
                    key={`notes-${noteFolderFilter ?? "all"}`}
                    className="animate-vault-header font-display min-w-[8rem] text-[32px] font-semibold tracking-[-0.02em]"
                  >
                    {headerTitle}
                  </h1>
                </div>
                <div className="flex min-w-[200px] flex-1 justify-end gap-3">
                  <input
                    value={noteSearch}
                    placeholder="Search notes…"
                    onChange={(e) => setNoteSearch(e.target.value)}
                    className="vault-input min-w-[12rem] max-w-md flex-1 text-sm"
                  />
                  <button
                    type="button"
                    className="shrink-0 rounded-2xl bg-[#121212] hover:bg-black px-6 py-3 text-sm font-semibold text-white shadow-sm transition active:scale-[0.98]"
                    onClick={() => openCreateNoteModal()}
                  >
                    Create a note
                  </button>
                </div>
              </header>
              <p className="-mt-5 mb-7 text-[13px] text-vault-muted">
                A quiet space for the details you want close. Your changes are saved as you write.
              </p>
              {notesFiltered.length === 0 ? (
                <div className="glass-panel mx-auto mt-8 flex max-w-lg flex-col items-center rounded-[28px] px-10 py-16 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-vault-accentSoft/40 text-vault-accentDeep">
                    <IconNotesLarge />
                  </div>
                  <h2 className="font-display mt-6 text-2xl font-semibold tracking-tight text-vault-text">Start your private notebook.</h2>
                  <p className="mt-3 max-w-sm text-sm leading-relaxed text-vault-muted">
                    Keep recovery codes, thoughts, and sensitive details encrypted in one quiet place.
                  </p>
                  <button
                    type="button"
                    onClick={() => openCreateNoteModal()}
                    className="mt-8 rounded-xl bg-[#121212] hover:bg-black px-8 py-3 text-sm font-semibold text-white shadow-sm transition active:scale-[0.98]"
                  >
                    Create my first note
                  </button>
                </div>
              ) : (
                <div className="animate-vault-grid grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {notesFiltered.map((n, index) => (
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
                      className="reveal-card card-lift group relative flex min-h-[10rem] w-full min-w-0 cursor-pointer flex-col overflow-hidden rounded-[22px] border border-white/70 text-left shadow-soft outline-none ring-vault-accent/25 hover:shadow-float focus-visible:ring-2"
                      style={{ ...noteCardSurfaceStyle(n.color), "--i": index }}
                    >
                      <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex items-center justify-between gap-2 px-2 pt-2">
                        <button
                          type="button"
                          title="Bring to desktop"
                          className="pointer-events-auto rounded-lg p-1.5 text-vault-text/75 transition hover:bg-vault-accentSoft/50 hover:text-vault-accentDeep"
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
                            className={`pointer-events-auto rounded-lg p-1.5 transition hover:bg-vault-accentSoft/50 ${
                              n.favorite ? "text-vault-accentDeep" : "text-vault-text/55"
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
                            className={`pointer-events-auto rounded-lg p-1.5 transition hover:bg-vault-accentSoft/50 ${
                              vaultPinnedFront ? "text-vault-accentDeep" : "text-vault-text/55"
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
                <h1 className="animate-vault-header font-display min-w-[8rem] text-[28px] font-semibold tracking-tight">
                  Starred items
                </h1>
                <div className="flex min-w-[200px] flex-1 justify-end">
                  <input
                    value={search}
                    placeholder="Search favorites…"
                    onChange={(e) => setSearch(e.target.value)}
                    className="vault-input min-w-[12rem] max-w-md flex-1 text-sm"
                  />
                </div>
              </header>
              <p className="-mt-4 mb-6 text-[13px] text-vault-muted">
                Passwords and notes you starred, ordered by recently updated.
              </p>
              {favoritesDashboardRows.length === 0 ? (
                <div className="glass-panel mx-auto mt-8 flex max-w-lg flex-col items-center rounded-[28px] px-10 py-16 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-vault-accentSoft/40 text-vault-accentDeep">
                    <svg
                      width="32"
                      height="32"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden
                    >
                      <path d="M12 2.5c.4 0 .8.2 1 .6l2.1 4.3 4.7.7c.5.1.9.5 1 1 .1.5-.1 1-.5 1.3l-3.4 3.3.8 4.7c.1.5-.1 1-.5 1.3-.4.3-1 .3-1.4 0L12 18.2 8.3 20.4c-.4.3-1 .2-1.4-.1-.4-.3-.6-.8-.5-1.3l.8-4.7-3.4-3.3c-.4-.3-.6-.8-.5-1.3.1-.5.5-.9 1-1l4.7-.7 2.1-4.3c.2-.4.6-.6 1-.6z" />
                    </svg>
                  </div>
                  <h2 className="font-display mt-6 text-2xl font-semibold tracking-tight text-vault-text">Your quick-access space is empty.</h2>
                  <p className="mt-3 max-w-sm text-sm leading-relaxed text-vault-muted">
                    Star the logins and notes you reach for most. They will appear here, ready when you need them.
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
                        className="group relative flex min-h-[8rem] w-full min-w-0 cursor-pointer flex-col overflow-hidden rounded-[22px] border border-vault-border/60 text-left shadow-soft outline-none ring-vault-accent/25 card-lift hover:shadow-float focus-visible:ring-2"
                        style={noteCardSurfaceStyle(row.note.color)}
                      >
                        <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex items-center justify-between gap-2 px-2 pt-2">
                          <button
                            type="button"
                            title="Bring to desktop"
                            className="pointer-events-auto rounded-lg p-1.5 text-vault-text/75 transition hover:bg-vault-accentSoft/50 hover:text-vault-accentDeep"
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
                              className={`pointer-events-auto rounded-lg p-1.5 transition hover:bg-vault-accentSoft/50 ${
                                row.note.favorite ? "text-vault-accentDeep" : "text-vault-text/55"
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
                              className={`pointer-events-auto rounded-lg p-1.5 transition hover:bg-vault-accentSoft/50 ${
                                vaultPinnedFront ? "text-vault-accentDeep" : "text-vault-text/55"
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
              {/* Anime Solarpunk Panoramic Banner */}
              <div className="relative mb-6 overflow-hidden rounded-[26px] border border-slate-200/80 bg-white shadow-sm">
                <div className="relative flex items-center h-44 w-full sm:h-52 lg:h-56 overflow-hidden px-6 sm:px-8">
                  <img
                    src={dashBannerArt}
                    alt="Solarpunk Password Sanctuary"
                    className="absolute inset-0 h-full w-full object-cover object-center pointer-events-none"
                  />
                  {/* Strong white gradient overlay from the left for high text contrast */}
                  <div className="pointer-events-none absolute inset-0 w-full sm:w-[650px] bg-gradient-to-r from-white via-white/95 to-transparent z-10" />
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-white/60 to-transparent z-10" />

                  {/* Floating Anime Header Content */}
                  <div className="relative z-20 max-w-lg">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-500/15 border border-orange-500/25 px-2.5 py-0.5 text-[11px] font-bold text-orange-700 backdrop-blur-sm">
                      ✦ Zero-Knowledge Vault
                    </span>
                    <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
                      Passvault for idiots like us
                    </h2>
                    <p className="mt-1.5 text-xs sm:text-sm font-semibold text-slate-600 leading-snug">
                      developer · handeled · Abhinav Silwal
                    </p>
                  </div>

                  {/* Right Status Pill / Update Button */}
                  <div className="absolute right-4 top-4 z-20 flex items-center gap-2">
                    {updaterOffer && updaterPackaged !== false ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (
                            updaterOffer &&
                            updaterDownloadedVersion &&
                            updaterDownloadedVersion === updaterOffer.version
                          ) {
                            void api.quitAndInstallUpdate?.();
                          } else {
                            setUpdaterModal("available");
                          }
                        }}
                        className="inline-flex items-center gap-2 rounded-full bg-[#121212] hover:bg-black text-white px-3.5 py-1.5 text-xs font-semibold shadow-md transition active:scale-[0.98]"
                      >
                        <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span>
                          {updaterDownloadedVersion && updaterOffer && updaterDownloadedVersion === updaterOffer.version
                            ? `Restart to update (${updaterOffer.version})`
                            : `Update available (${updaterOffer.version})`}
                        </span>
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-white/90 px-3 py-1 text-xs font-semibold text-emerald-700 shadow-sm backdrop-blur-md">
                        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                        Enclave Armed
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1
                    key={`items-${categoryFilter ?? "all"}`}
                    className="font-sans text-[20px] font-bold tracking-tight text-slate-900"
                  >
                    {categoryFilter != null ? headerTitle : "All logins"}
                  </h1>
                </div>
                <div className="flex min-w-[200px] flex-1 justify-end gap-3">
                  <input
                    value={search}
                    placeholder="Search apps, URLs, notes…"
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full max-w-xs rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 shadow-sm transition focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                  />
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#121212] hover:bg-black px-4 py-2 text-xs font-semibold text-white shadow-sm transition active:scale-[0.99]"
                    onClick={openAddCredential}
                  >
                    <span>+ Save a login</span>
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
        </main>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
            aria-label="Dismiss"
            onClick={() => setCategoryModal(false)}
          />
          <div className="glass-modal animate-vault-modal relative z-10 w-full max-w-md rounded-[28px] p-8">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Organize your library</div>
            <div className="font-display mb-2 mt-2 text-2xl font-semibold tracking-tight text-slate-900">Create a category</div>
            <p className="mb-6 text-sm leading-relaxed text-slate-600">Group related logins together so they stay effortless to find.</p>
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Category name</label>
            <input
              value={newCatName}
              placeholder="e.g. Work, Banking, Social"
              onChange={(e) => setNewCatName(e.target.value)}
              className="vault-input mb-8"
              onKeyDown={(e) => e.key === "Enter" && addCategory()}
              autoFocus
            />
            <div className="flex justify-end gap-3">
              <button
                type="button"
                className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-5 py-2.5 text-sm font-medium text-slate-700 transition"
                onClick={() => setCategoryModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-xl bg-[#121212] hover:bg-black px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition active:scale-[0.98]"
                onClick={() => void addCategory()}
              >
                Create category
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {credModal ? (
        <CredentialModal
          categories={categoriesForm}
          generalCategoryId={generalCategoryId}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
            aria-label="Dismiss"
            onClick={() => setNoteFolderModal(false)}
          />
          <div className="glass-modal animate-vault-modal relative z-10 w-full max-w-md rounded-[28px] p-8">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-vault-accentDeep">Your note library</div>
            <div className="font-display mb-2 mt-2 text-2xl font-semibold tracking-tight text-vault-text">Create a folder</div>
            <p className="mb-6 text-sm leading-relaxed text-vault-muted">Give this collection a distinct name to keep your thoughts organised.</p>
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.08em] text-vault-muted">Folder name</label>
            <input
              value={newNoteFolderName}
              placeholder="e.g. Recovery keys, Ideas, Project logs"
              onChange={(e) => setNewNoteFolderName(e.target.value)}
              className="vault-input mb-8"
              onKeyDown={(e) => e.key === "Enter" && void addNoteFolder()}
              autoFocus
            />
            <div className="flex justify-end gap-3">
              <button
                type="button"
                className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-5 py-2.5 text-sm font-medium text-slate-700 transition"
                onClick={() => setNoteFolderModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-xl bg-[#121212] hover:bg-black px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition active:scale-[0.98]"
                onClick={() => void addNoteFolder()}
              >
                Create folder
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {noteNameModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
            aria-label="Dismiss"
            onClick={() => setNoteNameModal(false)}
          />
          <div className="glass-modal animate-vault-modal relative z-10 w-full max-w-md rounded-[28px] p-8">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">A fresh private note</div>
            <div className="font-display mb-2 mt-2 text-2xl font-semibold tracking-tight text-slate-900">What is this note about?</div>
            <p className="mb-6 text-sm text-slate-600">
              You can change this anytime. Leave blank to default to &quot;Untitled&quot;.
            </p>
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Note title</label>
            <input
              value={newNoteTitleInput}
              placeholder="e.g. Server emergency runbook"
              onChange={(e) => setNewNoteTitleInput(e.target.value)}
              className="vault-input mb-8"
              onKeyDown={(e) => e.key === "Enter" && void createNoteFromModal()}
              autoFocus
            />
            <div className="flex justify-end gap-3">
              <button
                type="button"
                className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-5 py-2.5 text-sm font-medium text-slate-700 transition"
                onClick={() => setNoteNameModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-xl bg-[#121212] hover:bg-black px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition active:scale-[0.98]"
                onClick={() => void createNoteFromModal()}
              >
                Start writing
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {noteEditorNote ? (
        <VaultNoteEditorModal
          key={noteEditorNote.id}
          note={noteEditorNote}
          folders={noteFoldersSelectable}
          inboxFolderId={inboxFolderId}
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

      {typeof api?.setCompactMode === "function" ? (
        <button
          type="button"
          title="Switch to compact mini vault"
          aria-label="Switch to compact mini vault"
          onClick={() => void setCompact(true)}
          className="fixed bottom-6 right-6 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-[#121212] text-white shadow-lg transition hover:bg-black active:scale-[0.94]"
        >
          <IconCompactDisplay />
        </button>
      ) : null}

      {toast ? (
        <div className="animate-vault-toast pointer-events-none fixed bottom-8 left-1/2 z-[60] -translate-x-1/2 rounded-full border border-vault-accent/30 bg-[#171c19]/95 px-5 py-2.5 text-sm font-medium text-vault-text shadow-float backdrop-blur-vault">
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
    <div className="relative flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-vault-bg">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-2">
        <div
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-vault-border/60 shadow-inner"
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
            placeholder="Write on the parchment…"
            className="min-h-0 w-full min-w-0 flex-1 resize-none border-0 bg-transparent font-sans text-vault-text outline-none [box-sizing:border-box] [font-feature-settings:'tnum'] placeholder:text-vault-muted/40 focus:ring-0"
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

const FLOAT_NOTE_SUBTITLE = "Myvault";

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
        <div className="relative flex h-full min-h-0 flex-1 items-center justify-center bg-vault-bg font-sans text-vault-muted">
          <Aurora />
          <span className="relative z-10 text-xs font-medium">Opening note…</span>
        </div>
      </WindowShell>
    );
  }

  if (phase === "missing" || !note) {
    return (
      <WindowShell title="Note" subtitle={FLOAT_NOTE_SUBTITLE}>
        <div className="relative flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-4 bg-vault-bg p-8 font-sans">
          <Aurora />
          <div className="glass-modal relative z-10 flex max-w-sm flex-col items-center rounded-[28px] p-8 text-center">
            <h3 className="font-display text-lg font-semibold text-vault-text">Note not found</h3>
            <p className="mt-2 text-xs leading-relaxed text-vault-muted">This note may have been deleted or moved from another device.</p>
            <button
              type="button"
              className="mt-6 rounded-xl bg-[#121212] hover:bg-black px-6 py-2 text-xs font-semibold text-white shadow-sm transition active:scale-[0.98]"
              onClick={() => void api.closeNoteFloatWindow()}
            >
              Close window
            </button>
          </div>
        </div>
      </WindowShell>
    );
  }

  return (
    <WindowShell title={titleBarName} subtitle={FLOAT_NOTE_SUBTITLE}>
      <div className="flex min-h-0 h-full min-w-0 flex-1 flex-col overflow-hidden bg-vault-bg">
        <DesktopOnlyNotepad key={note.id} note={note} onAutosaved={refreshNotes} />
      </div>
    </WindowShell>
  );
}

function VaultNoteEditorModal({
  note,
  folders,
  inboxFolderId,
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
    let fid = note.folderId;
    if (
      inboxFolderId != null &&
      Number(fid) === Number(inboxFolderId) &&
      folders.length > 0
    ) {
      fid = folders[0].id;
    } else if (folders.length > 0 && !folders.some((f) => Number(f.id) === Number(fid))) {
      fid = folders[0].id;
    }
    setTitle(t);
    setBody(b);
    setColor(c);
    setFolderId(fid);
    setFavorite(fav);
    stateRef.current = {
      title: t,
      body: b,
      color: c,
      folderId: fid,
      favorite: fav,
    };
  }, [note.id, note.updatedAt, note.folderId, folders, inboxFolderId]);

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
        className="absolute inset-0 bg-black/60 backdrop-blur-md"
        aria-label="Close"
        onClick={() => void handleClose()}
      />
      <div className="glass-modal animate-vault-modal relative z-10 flex max-h-[min(92dvh,880px)] w-full max-w-xl flex-col overflow-hidden rounded-t-[28px] sm:rounded-[28px]">
        <div className="shrink-0 border-b border-vault-border/50 p-7 pb-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-vault-accentDeep">Encrypted notepad</div>
              <input
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  scheduleSave();
                }}
                onBlur={() => void saveImmediate()}
                className="vault-input mt-1.5 font-display text-lg font-semibold"
                placeholder="Untitled"
              />
            </div>
            <button
              type="button"
              title="Save and close"
              onClick={() => void handleClose()}
              className="shrink-0 rounded-xl bg-[#121212] hover:bg-black px-7 py-2.5 text-sm font-semibold text-white shadow-sm transition active:scale-[0.98]"
            >
              Done
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-7 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-[140px] flex-1">
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.08em] text-vault-muted">Folder</label>
              <select
                className="vault-input"
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
            </div>

            <label className="mt-5 flex cursor-pointer items-center gap-2.5 text-xs font-medium text-vault-text">
              <input
                type="checkbox"
                checked={favorite}
                onChange={(e) => {
                  setFavorite(e.target.checked);
                  scheduleSave();
                }}
                className="h-4 w-4 shrink-0 rounded border-vault-border/40 accent-vault-accent"
              />
              <span>Star as favorite</span>
            </label>
          </div>

          <div className="mt-5">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-vault-muted">Paper tint</div>
            <div className="flex flex-wrap gap-2.5">
              {NOTE_PALETTE.map((p, idx) => (
                <button
                  key={String(idx)}
                  type="button"
                  title={`Tint ${idx + 1}`}
                  onClick={() => {
                    setColor(idx);
                    scheduleSave();
                  }}
                  className={`h-8 w-8 rounded-full border-2 transition-transform duration-150 ${
                    color === idx ? "border-vault-accent ring-2 ring-vault-accent/40 scale-110" : "border-vault-border/60 hover:scale-105"
                  }`}
                  style={{ backgroundColor: p.tint }}
                />
              ))}
            </div>
          </div>

          <div className="mt-5 flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-vault-muted">
                Ruled parchment
              </span>
              <span className="text-[10px] text-vault-muted/60">Auto-saves continuously · ⌘S</span>
            </div>
            <div
              className="flex min-h-[min(48vh,420px)] flex-1 flex-col overflow-hidden rounded-2xl border border-vault-border/70 shadow-inner"
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
                placeholder="Write your private notes here..."
                className="min-h-0 w-full min-w-0 flex-1 resize-y border-0 bg-transparent font-sans text-vault-text outline-none [box-sizing:border-box] placeholder:text-vault-muted/40 focus:ring-0"
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
          </div>
        </div>

        <div className="shrink-0 border-t border-vault-border/50 px-7 py-4">
          <div className="flex justify-end">
            <button
              type="button"
              className="btn-danger px-5 py-2 text-xs"
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

function LogoMark({ className = "h-8 w-8" }) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center select-none ${className}`} aria-hidden>
      <svg viewBox="0 0 32 32" fill="none" className="h-full w-full">
        <defs>
          <linearGradient id="mv-logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fb923c" />
            <stop offset="50%" stopColor="#f97316" />
            <stop offset="100%" stopColor="#ea580c" />
          </linearGradient>
          <filter id="mv-logo-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1" stdDeviation="1.2" floodColor="#c2410c" floodOpacity="0.32" />
          </filter>
        </defs>
        <g filter="url(#mv-logo-shadow)">
          {/* 6-petal anime solarpunk flower emblem */}
          <path
            d="M16 2.8C16.8 7.6 18.5 10 23.5 10.8C18.5 11.6 16.8 14 16 18.8C15.2 14 13.5 11.6 8.5 10.8C13.5 10 15.2 7.6 16 2.8Z"
            fill="url(#mv-logo-grad)"
          />
          <path
            d="M23.5 10.8C22.6 15.6 24.1 18.2 28.5 20.6C23.8 21.4 21.4 23.8 20.6 28.5C19.8 23.8 17.4 21.4 12.7 20.6C17.1 18.2 18.6 15.6 17.8 10.8C20.5 13.1 21.5 13.1 23.5 10.8Z"
            fill="url(#mv-logo-grad)"
            opacity="0.9"
          />
          <path
            d="M8.5 10.8C11.2 13.1 12.2 13.1 14.9 10.8C14.1 15.6 15.6 18.2 20 20.6C15.3 21.4 12.9 23.8 12.1 28.5C11.3 23.8 8.9 21.4 4.2 20.6C8.6 18.2 10.1 15.6 9.3 10.8"
            fill="url(#mv-logo-grad)"
            opacity="0.8"
          />
          <circle cx="16" cy="16" r="3" fill="#ffffff" />
          <circle cx="16" cy="16" r="1.5" fill="#ea580c" />
        </g>
      </svg>
    </span>
  );
}

function RailIconButton({ children, title, label, active, onClick }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`mb-1 flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left transition-all duration-200 ease-vault ${
        active
          ? "bg-vault-accent font-semibold text-[#12100a] shadow-brass"
          : "text-vault-muted hover:-translate-y-0.5 hover:bg-vault-accentSoft/55 hover:text-vault-accentDeep"
      }`}
    >
      {children}
      <span className="rail-label text-[13px] font-semibold">{label || title}</span>
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

function IconCompactDisplay() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2.5" y="3.5" width="19" height="14" rx="2.5" />
      <rect x="12.5" y="9" width="6.5" height="6" rx="1.2" fill="currentColor" stroke="none" />
      <path d="M8 21h8" />
    </svg>
  );
}

function IconExpandWindow() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">
      <path d="M7 2h3v3" />
      <path d="M10 2 6.5 5.5" />
      <path d="M5 10H2V7" />
      <path d="M2 10l3.5-3.5" />
    </svg>
  );
}

function IconSearchSmall() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

/** Compact always-available vault: drag a card into any browser password field to fill it. */
const DROP_AUTOFILL_MESSAGES = {
  "not-dropped-on-field": "Drop onto the username box to fill",
  "dropped-on-password-field": "Drop onto the username box, not the password box",
  "next-field-not-password": "Username filled — password field not found, click it and drop again",
  "could-not-focus-window": "Couldn't reach that window — click it once and retry",
};

function MiniVault({
  items,
  pinned,
  collapsed,
  onCollapse,
  onRestore,
  onTogglePin,
  onExpand,
  onCopy,
  onNotify,
  toast,
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const rows = useMemo(() => {
    const favoritesThenRecent = (a, b) =>
      Number(!!b.favorite) - Number(!!a.favorite) ||
      String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
    const matches = q
      ? items.filter((i) => String(i.title || hostFromUrl(i.url) || "").toLowerCase().includes(q))
      : [...items];
    return matches.sort(favoritesThenRecent);
  }, [items, q]);

  const handleDragStart = (e, entry) => {
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData("text/plain", entry.username || entry.password || "");
    const ghost = document.createElement("div");
    ghost.textContent = entry.title || hostFromUrl(entry.url) || "Login";
    ghost.style.cssText =
      "position:fixed;top:-200px;left:-200px;padding:6px 12px;border-radius:10px;background:#121212;color:#fff;font:600 12px system-ui,sans-serif;box-shadow:0 6px 18px rgba(0,0,0,.25);white-space:nowrap;";
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 14, 14);
    setTimeout(() => ghost.remove(), 0);
    void api.pingActivity();
  };

  // Username was dropped into the browser field; the app now overwrites it and types the password.
  const handleDragEnd = (e, entry) => {
    if (e.dataTransfer.dropEffect === "none") return;
    if (!entry.username || !entry.password) return;
    void (async () => {
      const r = await api.autofillAfterDrop?.({ username: entry.username, password: entry.password });
      if (r && !r.ok && DROP_AUTOFILL_MESSAGES[r.reason]) onNotify(DROP_AUTOFILL_MESSAGES[r.reason]);
    })();
  };

  const fadeWhenCollapsed = `transition-opacity duration-200 ${
    collapsed ? "pointer-events-none opacity-0" : "opacity-100"
  }`;

  const ctrlBtn =
    "flex h-7 w-7 items-center justify-center rounded-full bg-white/85 text-slate-600 shadow-sm backdrop-blur transition hover:bg-slate-100 hover:text-slate-900 active:scale-[0.94]";

  return (
    <div className="relative flex h-screen flex-col overflow-hidden rounded-[14px] border border-slate-200/90 bg-white font-sans text-slate-900">
      <div className="relative shrink-0 overflow-hidden pb-4">
      <img
        src={dashBannerArt}
        alt=""
        draggable={false}
        className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-white via-white/70 to-white/20" />
      <div className="relative px-4 pt-[10px]" style={{ WebkitAppRegion: "drag" }}>
        <div className="flex items-center justify-end">
          <div className="flex shrink-0 items-center gap-1.5" style={{ WebkitAppRegion: "no-drag" }}>
            <button
              type="button"
              title={collapsed ? "Open mini vault" : "Collapse to bar"}
              aria-label={collapsed ? "Open mini vault" : "Collapse to bar"}
              className={ctrlBtn}
              onClick={collapsed ? onRestore : onCollapse}
            >
              {collapsed ? <IconTitleMaximize /> : <IconTitleMinimize />}
            </button>
            <button
              type="button"
              title={pinned ? "Unpin from top" : "Pin on top of other apps"}
              aria-label={pinned ? "Unpin from top" : "Pin on top of other apps"}
              aria-pressed={pinned}
              className={`${ctrlBtn} ${pinned ? "!bg-[#121212] !text-white" : ""}`}
              onClick={onTogglePin}
            >
              <IconPinSmall filled={pinned} />
            </button>
            <button type="button" title="Expand to full vault" aria-label="Expand to full vault" className={ctrlBtn} onClick={onExpand}>
              <IconExpandWindow />
            </button>
          </div>
        </div>
      </div>

      <div className={`relative px-4 pt-6 ${fadeWhenCollapsed}`}>
        <div className="relative">
          {!query ? (
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <IconSearchSmall />
            </span>
          ) : null}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title…"
            aria-label="Search logins by title"
            className={`w-full rounded-xl border border-slate-200 bg-white py-2 pr-3 text-sm text-slate-900 placeholder-slate-400 shadow-sm transition focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 ${
              query ? "pl-3" : "pl-9"
            }`}
          />
        </div>
      </div>
      </div>

      <div className={`shrink-0 px-4 pb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400 ${fadeWhenCollapsed}`}>
        {q ? `${rows.length} match${rows.length === 1 ? "" : "es"}` : "All logins"}
      </div>

      <div data-lenis-prevent className={`min-h-0 flex-1 space-y-1.5 overflow-y-auto px-4 pb-4 ${fadeWhenCollapsed}`}>
        {rows.length === 0 ? (
          <p className="px-1 pt-6 text-center text-xs leading-relaxed text-slate-400">
            {q ? "No login with that title." : "No logins saved yet."}
          </p>
        ) : (
          rows.map((entry) => (
            <div
              key={entry.id}
              role="button"
              tabIndex={0}
              draggable
              onDragStart={(e) => handleDragStart(e, entry)}
              onDragEnd={(e) => handleDragEnd(e, entry)}
              onClick={() => onCopy(entry)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onCopy(entry);
                }
              }}
              title="Drag into a password field, or click to copy"
              className="relative flex cursor-grab items-center gap-2 rounded-xl border border-slate-200/90 bg-white px-3 py-1.5 shadow-sm transition hover:border-slate-300 hover:shadow-md active:cursor-grabbing"
            >
              {entry.favorite ? (
                <span title="Favorite" aria-label="Favorite" className="absolute right-2 top-1.5 text-amber-500">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.3l-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9z" />
                  </svg>
                </span>
              ) : null}
              <div className={`min-w-0 flex-1 ${entry.favorite ? "pr-4" : ""}`}>
                <div className="truncate text-[13px] font-semibold leading-tight text-slate-900">
                  {entry.title || hostFromUrl(entry.url) || "Login"}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] leading-tight text-slate-500">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                  <span className="truncate">{entry.username || "No username"}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div
        aria-hidden
        className={`pointer-events-none absolute bottom-1 left-1/2 h-1 w-9 -translate-x-1/2 rounded-full bg-slate-300/90 ${fadeWhenCollapsed}`}
      />

      {toast ? (
        <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full bg-[#121212] px-4 py-2 text-xs font-medium text-white shadow-lg">
          {toast}
        </div>
      ) : null}
    </div>
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
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function IconCheckSmall() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IconUserSmall() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function IconKeySmall() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 2l-2 2m-1.5 1.5L16 7l-2-2-1.5 1.5 2 2-3 3a6 6 0 1 1-2.83-2.83l8.33-8.33z" />
    </svg>
  );
}

function IconGlobeSmall() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function getServicePalette(name = "") {
  const palettes = [
    { bg: "bg-blue-500/10", border: "border-blue-500/25", text: "text-blue-600", dot: "bg-blue-500" },
    { bg: "bg-emerald-500/10", border: "border-emerald-500/25", text: "text-emerald-600", dot: "bg-emerald-500" },
    { bg: "bg-amber-500/10", border: "border-amber-500/25", text: "text-amber-600", dot: "bg-amber-500" },
    { bg: "bg-violet-500/10", border: "border-violet-500/25", text: "text-violet-600", dot: "bg-violet-500" },
    { bg: "bg-rose-500/10", border: "border-rose-500/25", text: "text-rose-600", dot: "bg-rose-500" },
    { bg: "bg-cyan-500/10", border: "border-cyan-500/25", text: "text-cyan-600", dot: "bg-cyan-500" },
    { bg: "bg-indigo-500/10", border: "border-indigo-500/25", text: "text-indigo-600", dot: "bg-indigo-500" },
  ];
  let h = 0;
  for (let i = 0; i < (name || "").length; i++) h = (h << 5) - h + name.charCodeAt(i);
  return palettes[Math.abs(h) % palettes.length];
}

function CredCard({ entry, onOpen, onToggleFav, onCopyUsername, onCopyPassword }) {
  const [copiedUser, setCopiedUser] = useState(false);
  const [copiedPw, setCopiedPw] = useState(false);

  const displayName = formatDisplayName(entry);
  const timeAgo = formatRelativeTime(entry.updatedAt);

  const hasUsername = String(entry.username ?? "").trim().length > 0;
  const hasPassword = Boolean(entry.password);

  const initial = (displayName.charAt(0) || "P").toUpperCase();

  const handleCopyUser = (e) => {
    e.stopPropagation();
    if (!hasUsername) return;
    onCopyUsername(e);
    setCopiedUser(true);
    setTimeout(() => setCopiedUser(false), 1800);
  };

  const handleCopyPw = (e) => {
    e.stopPropagation();
    if (!hasPassword) return;
    onCopyPassword(e);
    setCopiedPw(true);
    setTimeout(() => setCopiedPw(false), 1800);
  };

  return (
    <motion.div
      role="button"
      tabIndex={0}
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-20px" }}
      transition={{ duration: 0.35, ease: [0.25, 0.8, 0.25, 1] }}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="group relative flex w-full cursor-pointer flex-col overflow-hidden rounded-[20px] border border-slate-200/80 bg-white shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-slate-300 hover:shadow-md outline-none"
    >
      {/* Top Graphic Canvas with subtle Dot Grid matching Screenshot 2 */}
      <div className="relative flex h-36 w-full items-center justify-center border-b border-slate-100 bg-[#f8fafc] bg-dots">
        {/* Star Button Top-Right */}
        <button
          type="button"
          title={entry.favorite ? "Remove from favorites" : "Add to favorites"}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFav(e);
          }}
          className={`absolute right-2.5 top-2.5 rounded-lg p-1.5 transition-all ${
            entry.favorite
              ? "text-amber-500 bg-amber-50"
              : "text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-slate-200/60 hover:text-slate-700"
          }`}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill={entry.favorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth={entry.favorite ? "0" : "1.8"}>
            <path d="M12 3.2c.35 0 .67.2.83.51l1.88 3.82 4.2.61c.92.13 1.29 1.27.62 1.92l-3.04 2.97.72 4.19c.16.92-.8 1.62-1.62 1.34L12 16.9l-3.76 1.98c-.82.27-1.78-.42-1.62-1.34l.72-4.19-3.04-2.97c-.67-.65-.3-1.79.62-1.92l4.2-.61 1.88-3.82c.16-.31.48-.51.83-.51z" />
          </svg>
        </button>

        {/* Centered Floating Pill matching Screenshot 2 */}
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200/90 bg-white/95 px-4 py-2.5 shadow-sm transition-transform duration-200 group-hover:scale-105">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-xs font-bold text-white shadow-sm">
            {initial}
          </div>
          <div className="min-w-0 pr-1">
            <div className="truncate max-w-[130px] text-xs font-semibold text-slate-800">
              {displayName}
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-medium text-emerald-600">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Protected
            </div>
          </div>
        </div>

        {/* Hover Quick Action Buttons */}
        <div className="absolute inset-x-3 bottom-2 flex items-center justify-between opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <button
            type="button"
            disabled={!hasUsername}
            onClick={handleCopyUser}
            className="flex items-center gap-1 rounded-lg bg-white/90 px-2.5 py-1 text-[11px] font-medium text-slate-700 shadow-sm backdrop-blur-sm hover:bg-slate-900 hover:text-white transition disabled:opacity-40"
          >
            {copiedUser ? <IconCheckSmall /> : <IconCopyRounded />}
            <span>{copiedUser ? "Copied" : "User"}</span>
          </button>
          <button
            type="button"
            disabled={!hasPassword}
            onClick={handleCopyPw}
            className="flex items-center gap-1 rounded-lg bg-white/90 px-2.5 py-1 text-[11px] font-medium text-slate-700 shadow-sm backdrop-blur-sm hover:bg-slate-900 hover:text-white transition disabled:opacity-40"
          >
            {copiedPw ? <IconCheckSmall /> : <IconKeySmall />}
            <span>{copiedPw ? "Copied" : "Password"}</span>
          </button>
        </div>
      </div>

      {/* Bottom Status Bar showing sensible card metadata */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-white text-xs border-t border-slate-100">
        <div className="flex min-w-0 items-center gap-1.5 text-slate-500">
          <IconGlobeSmall />
          <span className="truncate text-[11px] font-medium text-slate-600">
            {hostFromUrl(entry.url) || (hasUsername ? entry.username : "Personal login")}
          </span>
        </div>
        <div className="shrink-0 text-[11px] font-medium text-slate-400">
          {timeAgo}
        </div>
      </div>
    </motion.div>
  );
}

function EmptyVaultState({ onAdd }) {
  return (
    <div className="glass-panel mx-auto mt-8 flex max-w-lg flex-col items-center rounded-[32px] px-10 py-16 text-center">
      <LogoMark className="h-16 w-16 shadow-soft" />
      <div className="mt-5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Your private space is ready</div>
      <h2 className="font-display mt-2 text-2xl font-semibold tracking-tight text-slate-900">Start with the login you use most.</h2>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-600">
        Save a password or note, then let categories and favorites make the rest easy to find.
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="mt-8 rounded-2xl bg-[#121212] hover:bg-black px-8 py-3.5 text-sm font-bold text-white shadow-md transition active:scale-[0.98]"
      >
        Save my first login
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
        className="absolute inset-0 bg-black/60 backdrop-blur-md"
        aria-label="Cancel"
        onClick={onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="del-confirm-title"
        className="glass-modal animate-vault-modal relative z-10 w-full max-w-[440px] rounded-[28px] p-8"
      >
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-vault-danger">Permanent deletion</div>
        <h2 id="del-confirm-title" className="font-display mt-2 text-2xl font-semibold tracking-tight text-vault-text">
          {isNote ? "Delete this note?" : "Delete this login?"}
        </h2>
        <div className="mt-4 rounded-2xl border border-vault-border/60 bg-vault-surfaceElevated/60 p-4">
          <p className="text-[15px] font-semibold leading-snug text-vault-text">{itemTitle}</p>
          {!isNote && itemSubtitle ? (
            <p className="mt-1 text-[12px] text-vault-muted font-mono">{itemSubtitle}</p>
          ) : null}
        </div>
        <p className="mt-4 text-[13px] leading-relaxed text-vault-muted">
          {isNote
            ? "This note will be permanently erased from your encrypted local storage."
            : "This login will be permanently removed from your zero-knowledge archive."}
        </p>
        <div className="mt-8 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-5 py-2.5 text-sm font-medium text-slate-700 transition"
            onClick={onCancel}
          >
            Keep it
          </button>
          <button
            type="button"
            className="rounded-xl bg-rose-600 hover:bg-rose-700 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition active:scale-[0.98]"
            onClick={onConfirm}
          >
            Delete permanently
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
        className="absolute inset-0 bg-black/60 backdrop-blur-md"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="glass-modal animate-vault-modal relative z-10 w-full max-w-lg rounded-t-[28px] p-8 sm:rounded-[28px]">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-700">
              {cred.categoryName || "Uncategorized"}
            </div>
            <h2 className="font-display mt-2 text-2xl font-semibold tracking-tight text-slate-900">
              {cred.title || "Login"}
            </h2>
            <p className="mt-1 text-xs text-slate-400 font-mono">{hostFromUrl(cred.url) || "No URL"}</p>
          </div>
          <button
            type="button"
            title={cred.favorite ? "Starred" : "Star"}
            onClick={() => void onToggleFav()}
            className={`rounded-xl p-2.5 transition-all duration-200 ease-vault ${
              cred.favorite ? "text-amber-500 bg-amber-50" : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
            }`}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3.2c.35 0 .67.2.83.51l1.88 3.82 4.2.61c.92.13 1.29 1.27.62 1.92l-3.04 2.97.72 4.19c.16.92-.8 1.62-1.62 1.34L12 16.9l-3.76 1.98c-.82.27-1.78-.42-1.62-1.34l.72-4.19-3.04-2.97c-.67-.65-.3-1.79.62-1.92l4.2-.61 1.88-3.82c.16-.31.48-.51.83-.51z" />
            </svg>
          </button>
        </div>

        <dl className="space-y-4 text-sm">
          <div className="rounded-2xl border border-slate-200/90 bg-slate-50/70 p-3.5">
            <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Website URL</dt>
            <dd className="mt-1 break-all text-xs font-mono text-slate-900">{cred.url || "—"}</dd>
          </div>
          <div className="rounded-2xl border border-slate-200/90 bg-slate-50/70 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                Username / Email
              </dt>
              <button
                type="button"
                disabled={!String(cred.username ?? "").trim()}
                className="text-[11px] font-semibold text-slate-900 hover:text-black hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                onClick={() => onCopyUsername()}
              >
                Copy
              </button>
            </div>
            <dd className="mt-1 break-all font-mono text-xs font-medium text-slate-900">{cred.username || "—"}</dd>
          </div>
          <div className="rounded-2xl border border-slate-200/90 bg-slate-50/70 p-3.5">
            <dt className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                Password
              </span>
              <span className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={!cred.password}
                  className="text-[11px] font-semibold text-slate-900 hover:text-black hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => onCopyPassword()}
                >
                  Copy
                </button>
                <button
                  type="button"
                  disabled={!cred.password}
                  className="text-[11px] font-semibold text-slate-900 hover:text-black hover:underline disabled:opacity-40"
                  onClick={() => cred.password && setRevealedPw((x) => !x)}
                >
                  {revealedPw ? "Hide" : "Reveal"}
                </button>
              </span>
            </dt>
            <dd className="mt-1 font-mono text-xs tracking-wider text-slate-900">
              {revealedPw && cred.password ? cred.password : cred.password ? "••••••••••••••••" : "—"}
            </dd>
          </div>
          {cred.notes ? (
            <div className="rounded-2xl border border-slate-200/90 bg-slate-50/70 p-3.5">
              <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                Secure Notes
              </dt>
              <dd className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-800">
                {cred.notes}
              </dd>
            </div>
          ) : null}
          {updated ? (
            <p className="text-[11px] text-slate-400">Modified {updated}</p>
          ) : null}
        </dl>

        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onEdit}
            className="flex-1 rounded-xl bg-[#121212] hover:bg-black px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition active:scale-[0.98] sm:flex-none"
          >
            Edit login
          </button>
          <button
            type="button"
            onClick={onDeleteRequest}
            className="rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 px-5 py-2.5 text-sm font-semibold transition active:scale-[0.98]"
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

function CredentialModal({
  categories,
  generalCategoryId,
  initial,
  onClose,
  onSave,
  generatePassword,
}) {
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
    const firstId = categories[0]?.id ?? "";
    let cid = initial.categoryId ?? firstId;
    if (
      generalCategoryId != null &&
      Number(cid) === Number(generalCategoryId)
    ) {
      cid = firstId;
    } else if (
      cid !== "" &&
      categories.length > 0 &&
      !categories.some((c) => Number(c.id) === Number(cid))
    ) {
      cid = firstId;
    }
    setCategoryId(cid);
  }, [initial, categories, generalCategoryId]);

  return (
    <div className="fixed inset-0 z-50 flex min-h-0 items-end justify-center overflow-hidden sm:items-center sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-md"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cred-modal-title"
        className="glass-modal animate-vault-modal relative z-10 flex max-h-[min(92dvh,46rem)] w-full max-w-lg min-w-0 flex-col overflow-hidden rounded-t-[28px] sm:mx-4 sm:my-auto sm:max-h-[min(92dvh,52rem)] sm:rounded-[28px]"
      >
        <div className="border-b border-slate-200/80 px-8 pb-4 pt-8">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            {isEdit ? "Update archive" : "New encrypted record"}
          </div>
          <h2 id="cred-modal-title" className="font-display mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            {isEdit ? "Edit login" : "Save new login"}
          </h2>
          <p className="mt-1 text-xs text-slate-500">Encrypted locally with AES-GCM before write.</p>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden px-8 py-5">
          <div className="flex min-w-0 flex-col gap-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              App or Service Name
            </label>
            <input
              className="vault-input"
              placeholder="e.g. GitHub, ProtonMail, Figma"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus={!isEdit}
            />
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              Category
            </label>
            <select
              className="vault-input"
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

          <div className="flex min-w-0 flex-col gap-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              Website URL
            </label>
            <input
              className="vault-input font-mono text-xs"
              placeholder="https://..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              Username or Email
            </label>
            <input
              className="vault-input"
              placeholder="you@domain.com"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end sm:gap-2">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                Password
              </label>
              <input
                type="password"
                className="vault-input font-mono text-xs"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <button
              type="button"
              title="Generate a cryptographically secure random password"
              className="h-[42px] shrink-0 self-stretch px-4 text-xs font-semibold rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 transition active:scale-[0.98] sm:self-auto"
              onClick={() => setPassword(generatePassword(20))}
            >
              ✦ Generate
            </button>
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              Secure Notes <span className="font-normal text-slate-400">(2FA backup codes, PINs)</span>
            </label>
            <textarea
              className="vault-input min-h-[5rem] max-h-[12rem] resize-y"
              placeholder="Optional notes, encrypted alongside credentials"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <label className="flex shrink-0 cursor-pointer items-center gap-3 pt-1 text-sm font-medium text-slate-800">
            <input
              type="checkbox"
              checked={favorite}
              onChange={(e) => setFavorite(e.target.checked)}
              className="h-4 w-4 shrink-0 rounded border-slate-300 accent-[#121212]"
            />
            <span>Star as quick favorite</span>
          </label>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-slate-200/80 px-8 py-4">
          <button
            type="button"
            className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-5 py-2.5 text-sm font-medium text-slate-700 transition"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-xl bg-[#121212] hover:bg-black px-7 py-2.5 text-sm font-semibold text-white shadow-sm transition active:scale-[0.98]"
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
            {isEdit ? "Save changes" : "Store login"}
          </button>
        </div>
      </div>
    </div>
  );
}
