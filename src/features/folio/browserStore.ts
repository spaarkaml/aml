import { create } from "zustand";
import { persist } from "zustand/middleware";
import { isWithin, parentDir, remapPath } from "@/lib/paths";

/**
 * Per-device Folio Browser state (ADR-004): which folders are expanded, and the transient
 * inline-rename target. Expanded folders are stored as overrides keyed by Folio root so the
 * default (top-level open, deeper closed) still applies to folders never touched.
 */
interface BrowserState {
  expanded: Record<string, Record<string, boolean>>;
  root: string | null;
  renaming: string | null;
  setRoot: (root: string | null) => void;
  isExpanded: (path: string, depth: number) => boolean;
  setExpanded: (path: string, open: boolean) => void;
  toggle: (path: string, depth: number) => void;
  /** Expands every ancestor folder of `path` so it is visible in the tree. */
  reveal: (path: string) => void;
  startRename: (path: string | null) => void;
  rename: (from: string, to: string) => void;
  forget: (path: string) => void;
}

export const useBrowserStore = create<BrowserState>()(
  persist(
    (set, get) => ({
      expanded: {},
      root: null,
      renaming: null,

      setRoot: (root) => set({ root, renaming: null }),

      isExpanded: (path, depth) => {
        const { root, expanded } = get();
        const v = root ? expanded[root]?.[path] : undefined;
        return v ?? depth < 1;
      },

      setExpanded: (path, open) => {
        const root = get().root;
        if (!root) return;
        set((s) => ({
          expanded: { ...s.expanded, [root]: { ...s.expanded[root], [path]: open } },
        }));
      },

      toggle: (path, depth) => get().setExpanded(path, !get().isExpanded(path, depth)),

      reveal: (path) => {
        let dir = parentDir(path);
        while (dir) {
          get().setExpanded(dir, true);
          dir = parentDir(dir);
        }
      },

      startRename: (path) => set({ renaming: path }),

      rename: (from, to) => {
        const root = get().root;
        if (!root) return;
        set((s) => {
          const cur = s.expanded[root] ?? {};
          const next: Record<string, boolean> = {};
          for (const [p, open] of Object.entries(cur)) next[remapPath(p, from, to)] = open;
          return { expanded: { ...s.expanded, [root]: next }, renaming: null };
        });
      },

      forget: (path) => {
        const root = get().root;
        if (!root) return;
        set((s) => {
          const cur = s.expanded[root] ?? {};
          const next: Record<string, boolean> = {};
          for (const [p, open] of Object.entries(cur)) if (!isWithin(p, path)) next[p] = open;
          return { expanded: { ...s.expanded, [root]: next } };
        });
      },
    }),
    { name: "aml.browser", version: 1, partialize: (s) => ({ expanded: s.expanded }) },
  ),
);
