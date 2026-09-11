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

interface SyncState {
  status: SyncStatus | null;
  /** When the last connected peer went away (or when polling began with none). */
  disconnectedSince: number | null;
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
  const peers = status.devices.filter((d) => folder.devices.includes(d.id));
  if (peers.length === 0) return "No NAS paired";
  if (!peers.some((d) => d.connected)) {
    const waited = disconnectedSince === null ? 0 : now - disconnectedSince;
    return waited < OFFLINE_AFTER_MS ? "Finding the NAS…" : "NAS offline";
  }
  if (folder.state === "syncing" || (folder.completion ?? 100) < 100) {
    return `Syncing ${Math.floor(folder.completion ?? 0)}%`;
  }
  if (folder.state === "scanning") return "Scanning…";
  return "NAS · up to date";
}
