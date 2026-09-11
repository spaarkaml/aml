import { create } from "zustand";
import { commands, type NoteType } from "@/ipc";

interface TypesState {
  /** Every type the Folio knows about, most used first. */
  list: NoteType[];
  /** `note path → type id`, so a list of notes can be badged without asking per note. */
  byNote: Record<string, string>;
  refresh: () => Promise<void>;
  clear: () => void;
  /**
   * Saves a type's name, colour or icon. The list changes at once so the tree and the
   * Properties panel follow the colour well as it is dragged; the file is written when the
   * dragging stops. The promise resolves once it has been.
   */
  save: (type: NoteType) => Promise<void>;
  /** The type with this id, or null — the id as written in a note's `type:`. */
  find: (id: string | null | undefined) => NoteType | null;
  /** The type of the note at `path`, or null. */
  ofNote: (path: string | null) => NoteType | null;
}

/**
 * Note Types (Q9, WP-3.3). A type is whatever a note's front matter says it is; this store
 * holds what the Folio knows about each one — its colour, its icon and the fields its
 * template declares — so no component has to work that out for itself.
 */
/** An OS colour well fires on every frame of a drag; one write per pause is enough. */
export const WRITE_DEBOUNCE_MS = 250;
interface PendingWrite {
  timer: ReturnType<typeof setTimeout> | undefined;
  waiting: Array<() => void>;
}
const writes = new Map<string, PendingWrite>();

export const useTypesStore = create<TypesState>((set, get) => ({
  list: [],
  byNote: {},

  refresh: async () => {
    const [list, byNote] = await Promise.all([commands.typesList(), commands.typesByNote()]);
    set({
      list: list.status === "ok" ? list.data : [],
      byNote: byNote.status === "ok" ? byNote.data : {},
    });
  },

  clear: () => set({ list: [], byNote: {} }),

  save: (type) => {
    set((s) => ({ list: s.list.map((t) => (t.id === type.id ? { ...type, custom: true } : t)) }));
    // Each call in a burst waits on the one write the burst produces, so nothing is left
    // holding a promise that the next keystroke quietly cancelled.
    const pending = writes.get(type.id) ?? { timer: undefined, waiting: [] };
    clearTimeout(pending.timer);
    return new Promise<void>((resolve) => {
      pending.waiting.push(resolve);
      pending.timer = setTimeout(() => {
        writes.delete(type.id);
        void commands.typeWrite(type).then((r) => {
          if (r.status === "ok") set({ list: r.data });
          for (const done of pending.waiting) done();
        });
      }, WRITE_DEBOUNCE_MS);
      writes.set(type.id, pending);
    });
  },

  find: (id) => {
    if (!id) return null;
    const slug = typeSlug(id);
    return get().list.find((t) => t.id === slug) ?? null;
  },

  ofNote: (path) => (path ? get().find(get().byNote[path]) : null),
}));

/** Mirrors `note_types::slug`: what a type is called once it is written into front matter. */
export function typeSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}
