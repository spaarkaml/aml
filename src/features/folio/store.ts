import { confirm, open as openDialog } from "@tauri-apps/plugin-dialog";
import { create } from "zustand";
import { useEditorStore } from "@/features/editor/store";
import { useTabsStore } from "@/features/tabs/store";
import { commands, type FolioInfo, type RecentFolio, type TreeNode } from "@/ipc";
import { baseName, isWithin, joinPath, noteTitle, parentDir } from "@/lib/paths";
import { useBrowserStore } from "./browserStore";
import { describeFolioError } from "./errors";

export { describeFolioError } from "./errors";

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
  /** Creates `Untitled.md` (or the next free name) in `dir`, opens it and starts a rename. */
  createNote: (dir: string) => Promise<string | null>;
  createFolder: (dir: string) => Promise<string | null>;
  /** Renames or moves an entry; `to` is the full new relative path. */
  rename: (from: string, to: string) => Promise<boolean>;
  /** Moves an entry to the OS trash after confirmation. */
  trash: (path: string) => Promise<boolean>;
}

/** Depth-first search of the loaded tree. */
export function findNode(tree: TreeNode[], path: string): TreeNode | undefined {
  for (const n of tree) {
    if (n.path === path) return n;
    if (n.kind === "folder") {
      const hit = findNode(n.children, path);
      if (hit) return hit;
    }
  }
  return undefined;
}

function childNames(tree: TreeNode[], dir: string): Set<string> {
  const nodes = dir ? (findNode(tree, dir)?.children ?? []) : tree;
  return new Set(nodes.map((n) => n.name.toLowerCase()));
}

/** "Untitled", "Untitled 2", … — first name not already used in `dir`. */
export function freeName(tree: TreeNode[], dir: string, base: string, ext = ""): string {
  const taken = childNames(tree, dir);
  for (let i = 1; ; i++) {
    const name = `${i === 1 ? base : `${base} ${i}`}${ext}`;
    if (!taken.has(name.toLowerCase())) return name;
  }
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

  createNote: async (dir) => {
    const path = joinPath(dir, freeName(get().tree, dir, "Untitled", ".md"));
    const r = await commands.entryCreateNote(path);
    if (r.status === "error") {
      set({ error: describeFolioError(r.error) });
      return null;
    }
    await get().refreshTree();
    const browser = useBrowserStore.getState();
    browser.reveal(path);
    useTabsStore.getState().open(path);
    browser.startRename(path);
    return path;
  },

  createFolder: async (dir) => {
    const path = joinPath(dir, freeName(get().tree, dir, "New folder"));
    const r = await commands.entryCreateFolder(path);
    if (r.status === "error") {
      set({ error: describeFolioError(r.error) });
      return null;
    }
    await get().refreshTree();
    const browser = useBrowserStore.getState();
    browser.reveal(path);
    browser.startRename(path);
    return path;
  },

  rename: async (from, to) => {
    if (from === to) return true;
    const editor = useEditorStore.getState();
    if (editor.path && isWithin(editor.path, from) && editor.dirty) await editor.saveNow();
    const r = await commands.entryRename(from, to);
    if (r.status === "error") {
      set({ error: describeFolioError(r.error) });
      return false;
    }
    useEditorStore.getState().renamed(from, to);
    useTabsStore.getState().rename(from, to);
    useBrowserStore.getState().rename(from, to);
    await get().refreshTree();
    return true;
  },

  trash: async (path) => {
    const node = findNode(get().tree, path);
    const what =
      node?.kind === "folder"
        ? `the folder "${baseName(path)}" and everything in it`
        : `"${noteTitle(path)}"`;
    const ok = await confirm(`Move ${what} to the ${trashName()}?`, {
      title: "Move to Trash",
      kind: "warning",
      okLabel: "Move to Trash",
      cancelLabel: "Cancel",
    });
    if (!ok) return false;
    const editor = useEditorStore.getState();
    if (editor.path && isWithin(editor.path, path)) await editor.close();
    const r = await commands.entryTrash(path);
    if (r.status === "error") {
      set({ error: describeFolioError(r.error) });
      return false;
    }
    useTabsStore.getState().closeWithin(path);
    useBrowserStore.getState().forget(path);
    await get().refreshTree();
    return true;
  },
}));

function trashName(): string {
  return navigator.platform.toLowerCase().includes("win") ? "Recycle Bin" : "Trash";
}

/** Folder that "New Note" should target: the active note's folder, else the root. */
export function activeDir(): string {
  const p = useEditorStore.getState().path;
  return p ? parentDir(p) : "";
}
