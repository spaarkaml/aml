import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { create } from "zustand";
import { describeFolioError } from "@/features/folio/errors";
import { commands, type SyncStatus } from "@/ipc";

export const POLL_MS = 5000;

interface SyncState {
  status: SyncStatus | null;
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
    open: false,
    busy: false,
    error: null,
    log: [],
    setOpen: (open) => set({ open, error: null }),
    refresh: async () => {
      const r = await commands.syncStatus();
      if (r.status === "ok") set({ status: r.data });
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

/** Short label for the status bar. */
export function describeSync(status: SyncStatus | null, path: string | null): string | null {
  if (!status?.enabled) return null;
  if (!status.running) return "Sync starting…";
  const folder = syncedFolderFor(status, path);
  if (!folder) return "Not synced";
  const peerOnline = status.devices.some((d) => folder.devices.includes(d.id) && d.connected);
  if (folder.error) return "Sync error";
  if (!peerOnline) return "NAS offline";
  if (folder.state === "syncing" || (folder.completion ?? 100) < 100) {
    return `Syncing ${Math.floor(folder.completion ?? 0)}%`;
  }
  if (folder.state === "scanning") return "Scanning…";
  return "NAS · up to date";
}
