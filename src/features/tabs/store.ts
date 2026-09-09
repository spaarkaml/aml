import { create } from "zustand";
import { persist } from "zustand/middleware";
import { isWithin, remapPath } from "@/lib/paths";

/**
 * Open tabs, the active note, and back/forward history — per Folio, per device.
 * The single editor instance follows `active`; switching tabs loads the note (autosave has
 * already written the previous one), so no per-tab dirty state is needed.
 */
interface FolioTabs {
  tabs: string[];
  active: string | null;
  /** Most recently activated notes, newest first (for Quick Open's empty query). */
  recents?: string[];
}

interface TabsState {
  folioRoot: string | null;
  byFolio: Record<string, FolioTabs>;
  back: string[];
  forward: string[];
  setFolio: (root: string | null) => void;
  open: (path: string) => void;
  activate: (path: string, opts?: { history?: boolean }) => void;
  close: (path: string) => void;
  /** Closes every tab at `path` or inside it (after a folder is trashed). */
  closeWithin: (path: string) => void;
  rename: (from: string, to: string) => void;
  /** Activates the tab `offset` places from the active one, wrapping around. */
  cycle: (offset: number) => void;
  /** Activates the nth tab (1-based); the last tab for 9, matching browser convention. */
  activateIndex: (n: number) => void;
  goBack: () => void;
  goForward: () => void;
  current: () => FolioTabs;
}

const EMPTY: FolioTabs = { tabs: [], active: null, recents: [] };
export const MAX_HISTORY = 50;
export const MAX_RECENTS = 20;

function pushRecent(recents: string[] | undefined, path: string): string[] {
  return [path, ...(recents ?? []).filter((p) => p !== path)].slice(0, MAX_RECENTS);
}

/** Adds `path` to the current Folio's tab list if it is not there yet. */
function ensureTab(path: string): void {
  const { folioRoot, byFolio } = useTabsStore.getState();
  if (!folioRoot) return;
  const cur = byFolio[folioRoot] ?? EMPTY;
  if (cur.tabs.includes(path)) return;
  useTabsStore.setState({
    byFolio: { ...byFolio, [folioRoot]: { ...cur, tabs: [...cur.tabs, path] } },
  });
}

export const useTabsStore = create<TabsState>()(
  persist(
    (set, get) => ({
      folioRoot: null,
      byFolio: {},
      back: [],
      forward: [],

      current: () => {
        const root = get().folioRoot;
        return (root && get().byFolio[root]) || EMPTY;
      },

      setFolio: (root) => set({ folioRoot: root, back: [], forward: [] }),

      open: (path) => {
        if (!get().folioRoot) return;
        ensureTab(path);
        get().activate(path);
      },

      activate: (path, opts) => {
        const root = get().folioRoot;
        if (!root) return;
        const cur = get().current();
        if (cur.active === path) return;
        const pushHistory = opts?.history !== false && cur.active !== null;
        set((s) => ({
          byFolio: {
            ...s.byFolio,
            [root]: { ...cur, active: path, recents: pushRecent(cur.recents, path) },
          },
          back: pushHistory ? [...s.back, cur.active as string].slice(-MAX_HISTORY) : s.back,
          forward: pushHistory ? [] : s.forward,
        }));
      },

      close: (path) => {
        const root = get().folioRoot;
        if (!root) return;
        const cur = get().current();
        const i = cur.tabs.indexOf(path);
        if (i === -1) return;
        const tabs = cur.tabs.filter((t) => t !== path);
        let active = cur.active;
        if (active === path) active = tabs[Math.min(i, tabs.length - 1)] ?? null;
        set((s) => ({
          byFolio: { ...s.byFolio, [root]: { ...cur, tabs, active } },
          back: s.back.filter((p) => p !== path),
          forward: s.forward.filter((p) => p !== path),
        }));
      },

      closeWithin: (path) => {
        for (const t of get().current().tabs) {
          if (isWithin(t, path)) get().close(t);
        }
      },

      cycle: (offset) => {
        const { tabs, active } = get().current();
        if (tabs.length < 2 || !active) return;
        const i = tabs.indexOf(active);
        const next = tabs[(i + offset + tabs.length) % tabs.length];
        if (next) get().activate(next);
      },

      activateIndex: (n) => {
        const { tabs } = get().current();
        const target = n >= 9 ? tabs[tabs.length - 1] : tabs[n - 1];
        if (target) get().activate(target);
      },

      rename: (from, to) => {
        const root = get().folioRoot;
        if (!root) return;
        const cur = get().current();
        const map = (p: string) => remapPath(p, from, to);
        set((s) => ({
          byFolio: {
            ...s.byFolio,
            [root]: {
              tabs: cur.tabs.map(map),
              active: cur.active ? map(cur.active) : null,
              recents: (cur.recents ?? []).map(map),
            },
          },
          back: s.back.map(map),
          forward: s.forward.map(map),
        }));
      },

      goBack: () => {
        const { back, current } = get();
        const target = back[back.length - 1];
        if (!target) return;
        const active = current().active;
        set((s) => ({
          back: s.back.slice(0, -1),
          forward: active ? [...s.forward, active].slice(-MAX_HISTORY) : s.forward,
        }));
        ensureTab(target);
        get().activate(target, { history: false });
      },

      goForward: () => {
        const { forward, current } = get();
        const target = forward[forward.length - 1];
        if (!target) return;
        const active = current().active;
        set((s) => ({
          forward: s.forward.slice(0, -1),
          back: active ? [...s.back, active].slice(-MAX_HISTORY) : s.back,
        }));
        ensureTab(target);
        get().activate(target, { history: false });
      },
    }),
    {
      name: "aml.tabs",
      version: 1,
      partialize: (s) => ({ byFolio: s.byFolio }),
    },
  ),
);
