import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useLayoutStore } from "@/features/layout/store";
import { commands, type TagEntry } from "@/ipc";
import { ancestorsOf } from "./tree";

interface TagsState {
  entries: TagEntry[];
  /** Expanded tag nodes (full tags). */
  expanded: Record<string, boolean>;
  /** Tag whose notes are listed, if any. */
  selected: string | null;
  refresh: () => Promise<void>;
  clear: () => void;
  toggle: (tag: string) => void;
  select: (tag: string | null) => void;
  /** Opens the left panel on the Tags view with `tag` expanded and selected. */
  show: (tag: string | null) => void;
}

export const useTagsStore = create<TagsState>()(
  persist(
    (set, get) => ({
      entries: [],
      expanded: {},
      selected: null,

      refresh: async () => {
        const r = await commands.tagsList();
        if (r.status === "ok") set({ entries: r.data });
      },
      clear: () => set({ entries: [], selected: null }),
      toggle: (tag) => set((s) => ({ expanded: { ...s.expanded, [tag]: !s.expanded[tag] } })),
      select: (tag) => set({ selected: tag }),
      show: (tag) => {
        const expanded = { ...get().expanded };
        if (tag) for (const a of ancestorsOf(tag)) expanded[a] = true;
        set({ selected: tag, expanded });
        useLayoutStore.getState().setLeftView("tags");
        useLayoutStore.getState().openPanel("left");
      },
    }),
    { name: "aml.tags", version: 2, partialize: (s) => ({ expanded: s.expanded }) },
  ),
);
