import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { create } from "zustand";
import { describeFolioError } from "@/features/folio/errors";
import { commands, type SyncStatus } from "@/ipc";

export const POLL_MS = 5000;

/**
 * How long the NAS may be unreachable before we stop calling it "looking" and call it offline.
 * Syncthing finds a device on the same LAN in seconds, but a first connection over global
 * discovery or a relay can take the better part of a minute — reporting "offline" during that
 * is wrong, and reporting "looking" forever is worse.
 */
export const OFFLINE_AFTER_MS = 60_000;

/**
 * How long a connected folder may sit at the same unfinished percentage before AML says it is
 * stuck. Syncthing retries a failed file on its own every minute or so; ten minutes of no
 * movement while the NAS is right there is not a slow sync, it is one that will not finish.
 */
export const STALLED_AFTER_MS = 10 * 60_000;

/** Where a folder's completion last changed, so "not moving" can be told from "slow". */
export interface Progress {
  completion: number;
  since: number;
}

interface SyncState {
  status: SyncStatus | null;
  /** When the last connected peer went away (or when polling began with none). */
  disconnectedSince: number | null;
  /** Per folder id: the unfinished completion it is at, and since when. */
  progress: Record<string, Progress>;
  /** The trouble banner that was dismissed; it stays away until the trouble changes. */
  dismissedTrouble: string | null;
  dismissTrouble: (key: string) => void;
  openGui: () => Promise<void>;
  open: boolean;
  busy: boolean;
  error: string | null;
  log: string[];
  setOpen: (open: boolean) => void;
  refresh: () => Promise<void>;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
  addDevice: (deviceId: string, name: string, address: string) => Promise<boolean>;
  removeDevice: (deviceId: string) => Promise<void>;
  /** Accepts a pending folder into a local folder chosen in the native picker. */
  acceptPending: (folderId: string, label: string, deviceId: string) => Promise<string | null>;
  shareFolio: (path: string, deviceId: string) => Promise<boolean>;
  loadLog: () => Promise<void>;
  clearError: () => void;
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Polls while the setup screen or a Folio is open; idle otherwise. */
export function startSyncPolling(): () => void {
  if (!timer) {
    void useSyncStore.getState().refresh();
    timer = setInterval(() => void useSyncStore.getState().refresh(), POLL_MS);
  }
  return () => {
    if (timer) clearInterval(timer);
    timer = null;
  };
}

type Action = () => Promise<
  | { status: "ok"; data: SyncStatus }
  | { status: "error"; error: Parameters<typeof describeFolioError>[0] }
>;

export const useSyncStore = create<SyncState>((set) => {
  const run = async (action: Action): Promise<boolean> => {
    set({ busy: true, error: null });
    const r = await action();
    if (r.status === "error") {
      set({ busy: false, error: describeFolioError(r.error) });
      return false;
    }
    set({ busy: false, status: r.data });
    return true;
  };
  return {
    status: null,
    disconnectedSince: null,
    progress: {},
    dismissedTrouble: null,
    dismissTrouble: (key) => set({ dismissedTrouble: key }),
    openGui: async () => {
      const r = await commands.syncOpenGui();
      if (r.status === "error") set({ error: describeFolioError(r.error) });
    },
    open: false,
    busy: false,
    error: null,
    log: [],
    setOpen: (open) => set({ open, error: null }),
    refresh: async () => {
      const r = await commands.syncStatus();
      if (r.status !== "ok") return;
      const anyConnected = r.data.devices.some((d) => d.connected);
      set((s) => ({
        status: r.data,
        disconnectedSince: anyConnected ? null : (s.disconnectedSince ?? Date.now()),
        progress: trackProgress(s.progress, r.data, Date.now()),
      }));
    },
    enable: async () => {
      await run(() => commands.syncEnable());
    },
    disable: async () => {
      await run(() => commands.syncDisable());
    },
    addDevice: (deviceId, name, address) =>
      run(() => commands.syncAddDevice(deviceId, name, address.trim() || null)),
    removeDevice: async (deviceId) => {
      await run(() => commands.syncRemoveDevice(deviceId));
    },
    acceptPending: async (folderId, label, deviceId) => {
      const picked = await openDialog({
        directory: true,
        multiple: false,
        title: `Where should “${label}” live on this computer?`,
      });
      if (typeof picked !== "string") return null;
      const ok = await run(() => commands.syncAcceptFolder(folderId, label, picked, deviceId));
      return ok ? picked : null;
    },
    shareFolio: (path, deviceId) => run(() => commands.syncShareFolder(path, deviceId, null)),
    loadLog: async () => {
      const r = await commands.syncLogTail();
      if (r.status === "ok") set({ log: r.data });
    },
    clearError: () => set({ error: null }),
  };
});

/**
 * Carries each unfinished folder's completion forward, keeping the time it was first seen at
 * that value. A folder that finishes, moves, or has no connected peer starts again: a sync
 * cannot be stuck on a NAS it cannot reach, only waiting for it.
 */
export function trackProgress(
  previous: Record<string, Progress>,
  status: SyncStatus,
  now: number,
): Record<string, Progress> {
  const next: Record<string, Progress> = {};
  for (const f of status.folders) {
    const connected = status.devices.some((d) => d.connected && f.devices.includes(d.id));
    const completion = f.completion ?? 100;
    const unfinished = completion < 100 || f.needItems > 0;
    if (!connected || !unfinished || f.paused) continue;
    const was = previous[f.id];
    next[f.id] = was && was.completion === completion ? was : { completion, since: now };
  }
  return next;
}

/** "just now", "12 min ago", "3 h ago", "yesterday", "12 Sep". */
export function seenAgo(iso: string | null | undefined, now: number = Date.now()): string | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} h ago`;
  if (minutes < 48 * 60) return "yesterday";
  return new Date(at).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

export type SyncTrouble =
  | {
      kind: "failures";
      key: string;
      folder: string;
      failures: SyncStatus["folders"][number]["failures"];
    }
  | { kind: "stalled"; key: string; folder: string; minutes: number; items: number };

/**
 * Whether the open Folio's sync needs a sentence rather than a status-bar word (WP-4.3).
 *
 * Only the silent failures qualify. Being offline is visible and is normal — travelling is how
 * ADR-005 expects AML to be used — so it never raises a banner. Files Syncthing cannot write,
 * or a connected sync that has stopped moving, look exactly like "syncing" and never finish.
 */
export function syncTrouble(
  status: SyncStatus | null,
  path: string | null,
  progress: Record<string, Progress>,
  now: number = Date.now(),
): SyncTrouble | null {
  const folder = syncedFolderFor(status, path);
  if (!status?.running || !folder || folder.paused) return null;
  const connected = status.devices.some((d) => d.connected && folder.devices.includes(d.id));
  if (!connected) return null;
  if (folder.failures.length > 0) {
    return {
      kind: "failures",
      key: `${folder.id}:failures:${folder.failures.map((f) => f.path).join("|")}`,
      folder: folder.label,
      failures: folder.failures,
    };
  }
  const p = progress[folder.id];
  if (p && now - p.since >= STALLED_AFTER_MS) {
    return {
      kind: "stalled",
      key: `${folder.id}:stalled:${p.since}`,
      folder: folder.label,
      minutes: Math.floor((now - p.since) / 60_000),
      items: folder.needItems,
    };
  }
  return null;
}

/** The synced folder that contains `path`, if any. */
export function syncedFolderFor(status: SyncStatus | null, path: string | null) {
  if (!status || !path) return null;
  const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "");
  const target = norm(path);
  return (
    status.folders.find((f) => {
      const fp = norm(f.path);
      return target === fp || target.startsWith(`${fp}/`);
    }) ?? null
  );
}

/**
 * Short label for the status bar. Connecting to a NAS has several distinct waits — the sidecar
 * booting, the device being found, the folder catching up — and they used to collapse into one
 * "NAS offline", which reads as a failure while everything is in fact working.
 */
export function describeSync(
  status: SyncStatus | null,
  path: string | null,
  disconnectedSince: number | null = null,
  now: number = Date.now(),
): string | null {
  if (!status?.enabled) return null;
  if (status.starting) return "Starting sync…";
  if (!status.running) return "Sync stopped";
  // With no Folio open there is nothing to say about syncing one; the engine states above
  // still show, so the Welcome screen tells you the sidecar is coming up.
  if (!path) return null;
  const folder = syncedFolderFor(status, path);
  if (!folder) return "Not synced";
  if (folder.error) return "Sync error";
  if (folder.paused) return "Sync paused";
  const peers = status.devices.filter((d) => folder.devices.includes(d.id));
  if (peers.length === 0) return "No NAS paired";
  if (peers.every((d) => d.paused)) return "Sync paused";
  if (!peers.some((d) => d.connected)) {
    const waited = disconnectedSince === null ? 0 : now - disconnectedSince;
    if (waited < OFFLINE_AFTER_MS) return "Finding the NAS…";
    // How long it has been is what tells a trip from a fault.
    const latest = peers
      .map((d) => d.lastSeen)
      .filter((t): t is string => !!t)
      .sort()
      .pop();
    const ago = seenAgo(latest, now);
    return ago ? `NAS offline · seen ${ago}` : "NAS offline";
  }
  if (folder.failures.length > 0) {
    const n = folder.failures.length;
    return `Sync stuck · ${n} ${n === 1 ? "file" : "files"}`;
  }
  if (folder.state === "syncing" || (folder.completion ?? 100) < 100) {
    return `Syncing ${Math.floor(folder.completion ?? 0)}%`;
  }
  if (folder.state === "scanning") return "Scanning…";
  return "NAS · up to date";
}
