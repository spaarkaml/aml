import { create } from "zustand";
import { useQuickOpenStore } from "@/features/quickopen/store";
import { type Backlink, commands, type Mention } from "@/ipc";
import { noteTitle } from "@/lib/paths";
import { wikiTarget } from "./complete";

/** Wiki target for the note the panel shows: its stem, or its path if the stem is shared. */
function targetFor(path: string): string {
  const entries = useQuickOpenStore.getState().entries;
  const entry = entries.find((e) => e.path === path);
  return entry ? wikiTarget(entry, entries) : noteTitle(path);
}

interface BacklinksState {
  /** Note the lists belong to. */
  path: string | null;
  backlinks: Backlink[];
  mentions: Mention[];
  loading: boolean;
  /** (Re)loads both lists for `path`; a stale answer for another note is dropped. */
  load: (path: string | null) => Promise<void>;
  /** Rewrites one mention into a `[[link]]`, then reloads. */
  linkMention: (m: Mention) => Promise<boolean>;
  linkAll: () => Promise<void>;
}

let generation = 0;

export const useBacklinksStore = create<BacklinksState>((set, get) => ({
  path: null,
  backlinks: [],
  mentions: [],
  loading: false,

  load: async (path) => {
    const gen = ++generation;
    if (!path) {
      set({ path: null, backlinks: [], mentions: [], loading: false });
      return;
    }
    set({ path, loading: true });
    const [b, m] = await Promise.all([commands.backlinks(path), commands.unlinkedMentions(path)]);
    if (gen !== generation) return;
    set({
      backlinks: b.status === "ok" ? b.data : [],
      mentions: m.status === "ok" ? m.data : [],
      loading: false,
    });
  },

  linkMention: async (m) => {
    const path = get().path;
    if (!path) return false;
    const r = await commands.linkMentionApply(m.source, m.line, m.matched, targetFor(path));
    const ok = r.status === "ok" && r.data;
    // The watcher also reports this write, but reload now so the row disappears at once.
    await get().load(path);
    return ok;
  },

  linkAll: async () => {
    const path = get().path;
    if (!path) return;
    // Later mentions on the same line shift after an earlier rewrite; re-read between them.
    for (const m of [...get().mentions]) {
      const r = await commands.linkMentionApply(m.source, m.line, m.matched, targetFor(path));
      if (r.status === "error") break;
    }
    await get().load(path);
  },
}));
