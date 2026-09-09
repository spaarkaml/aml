import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { create } from "zustand";
import { commands, type FolioError, type FolioInfo, type RecentFolio, type TreeNode } from "@/ipc";

/** Human-readable message for a FolioError; the UI never shows raw `kind` strings. */
export function describeFolioError(e: FolioError): string {
  switch (e.kind) {
    case "noFolioOpen":
      return "No Folio is open.";
    case "notAFolio":
      return `That folder is not a Folio yet (no .aml folder inside): ${e.detail}`;
    case "notFound":
      return `Not found: ${e.detail}`;
    case "invalidPath":
      return `Invalid path: ${e.detail}`;
    case "alreadyExists":
      return `Already exists: ${e.detail}`;
    case "conflict":
      return "This note changed on disk since you opened it.";
    case "notText":
      return `Not a text file: ${e.detail}`;
    case "io":
      return `File error: ${e.detail}`;
  }
}

interface FolioState {
  folio: FolioInfo | null;
  tree: TreeNode[];
  recent: RecentFolio[];
  busy: boolean;
  error: string | null;
  /** Non-Folio folder the user picked; offered for creation. */
  pendingCreate: string | null;
  bootstrap: () => Promise<void>;
  openPath: (path: string) => Promise<boolean>;
  createAt: (path: string, name?: string) => Promise<boolean>;
  pickAndOpen: () => Promise<void>;
  pickAndCreate: () => Promise<void>;
  refreshTree: () => Promise<void>;
  close: () => Promise<void>;
  clearError: () => void;
}

export const useFolioStore = create<FolioState>((set, get) => ({
  folio: null,
  tree: [],
  recent: [],
  busy: false,
  error: null,
  pendingCreate: null,

  bootstrap: async () => {
    const [current, recent] = await Promise.all([commands.folioCurrent(), commands.folioRecent()]);
    set({ recent });
    if (current.status === "ok" && current.data) {
      set({ folio: current.data });
      await get().refreshTree();
    }
  },

  openPath: async (path) => {
    set({ busy: true, error: null, pendingCreate: null });
    const r = await commands.folioOpen(path);
    if (r.status === "error") {
      set({
        busy: false,
        error: describeFolioError(r.error),
        pendingCreate: r.error.kind === "notAFolio" ? path : null,
      });
      return false;
    }
    set({ folio: r.data, busy: false, recent: await commands.folioRecent() });
    await get().refreshTree();
    return true;
  },

  createAt: async (path, name) => {
    set({ busy: true, error: null, pendingCreate: null });
    const r = await commands.folioCreate(path, name ?? null);
    if (r.status === "error") {
      set({ busy: false, error: describeFolioError(r.error) });
      return false;
    }
    set({ folio: r.data, busy: false, recent: await commands.folioRecent() });
    await get().refreshTree();
    return true;
  },

  pickAndOpen: async () => {
    const picked = await openDialog({ directory: true, multiple: false, title: "Open Folio" });
    if (typeof picked === "string") await get().openPath(picked);
  },

  pickAndCreate: async () => {
    const picked = await openDialog({
      directory: true,
      multiple: false,
      title: "Choose a folder for the new Folio",
    });
    if (typeof picked === "string") await get().createAt(picked);
  },

  refreshTree: async () => {
    const r = await commands.folioTree();
    if (r.status === "ok") set({ tree: r.data });
    else set({ error: describeFolioError(r.error) });
  },

  close: async () => {
    await commands.folioClose();
    set({ folio: null, tree: [] });
  },

  clearError: () => set({ error: null }),
}));
