import { create } from "zustand";
import { useEditorStore } from "@/features/editor/store";
import { describeFolioError } from "@/features/folio/errors";
import { type Conflict, commands, type Resolution } from "@/ipc";
import { type Choice, compose, type Hunk, hunks } from "./merge";

/**
 * What is being compared: a copy Syncthing set aside, or the open note's unsaved edits against
 * a version that landed on disk underneath them. Both are the same decision — two texts for
 * one note — so they get the same screen (WP-4.2).
 */
export type Source =
  | { kind: "file"; conflict: Conflict }
  | { kind: "editor"; path: string; diskMtime: number | null };

interface ConflictsState {
  open: boolean;
  list: Conflict[];
  error: string | null;
  notice: string | null;
  busy: boolean;
  source: Source | null;
  /** The version in place: the file as it is now, or what landed on disk. */
  original: string | null;
  /** The version set aside, or the unsaved edits. */
  copy: string | null;
  originalMtime: number | null;
  hunks: Hunk[];
  /** Per difference; a missing entry follows `fallback`. */
  choices: Record<number, Choice>;
  fallback: Choice;

  setOpen: (open: boolean) => void;
  refresh: () => Promise<void>;
  select: (conflict: Conflict) => Promise<void>;
  compareEditor: () => Promise<void>;
  back: () => void;
  choose: (id: number, choice: Choice) => void;
  chooseAll: (choice: Choice) => void;
  /** The text the current choices produce. */
  merged: () => string;
  resolve: (how: "keepOriginal" | "keepCopy" | "merge" | "keepBoth") => Promise<boolean>;
}

const cleared = {
  source: null,
  original: null,
  copy: null,
  originalMtime: null,
  hunks: [],
  choices: {},
  notice: null,
};

function kindOf(source: Source | null): "note" | "settings" {
  return source?.kind === "file" && source.conflict.kind === "settings" ? "settings" : "note";
}

export const useConflictsStore = create<ConflictsState>()((set, get) => ({
  open: false,
  list: [],
  error: null,
  busy: false,
  fallback: "original",
  ...cleared,

  setOpen: (open) => {
    set({ open, error: null, ...(open ? {} : cleared) });
    if (open) void get().refresh();
  },

  refresh: async () => {
    const r = await commands.conflictsList();
    if (r.status === "error") {
      // No Folio open is not an error worth a sentence: there is simply nothing to list.
      set({ list: [], error: r.error.kind === "noFolioOpen" ? null : describeFolioError(r.error) });
      return;
    }
    set({ list: r.data });
    const source = get().source;
    // The one on screen was resolved elsewhere — on the other machine, or by hand.
    if (source?.kind === "file" && !r.data.some((c) => c.path === source.conflict.path)) {
      set({ ...cleared });
    }
  },

  select: async (conflict) => {
    set({ busy: true, error: null, notice: null });
    const r = await commands.conflictRead(conflict.path);
    if (r.status === "error") {
      set({ busy: false, error: describeFolioError(r.error) });
      return;
    }
    const { originalText, copyText } = r.data;
    const source: Source = { kind: "file", conflict: r.data.conflict };
    set({
      busy: false,
      source,
      original: originalText,
      copy: copyText,
      originalMtime: r.data.conflict.originalExists ? r.data.conflict.originalMtime : null,
      hunks: originalText !== null && copyText !== null ? hunks(originalText, copyText) : [],
      choices: {},
      // A Boundings or settings file is one item per line: keeping both sides is almost always
      // right. A note is prose, where "both" means reading the same paragraph twice.
      fallback: r.data.conflict.kind === "settings" ? "both" : "original",
    });
  },

  compareEditor: async () => {
    const editor = useEditorStore.getState();
    const path = editor.path;
    if (!path) return;
    const mine = editor.currentMarkdown();
    const r = await commands.noteRead(path);
    if (r.status === "error") {
      set({ open: true, error: describeFolioError(r.error) });
      return;
    }
    set({
      open: true,
      error: null,
      notice: null,
      source: { kind: "editor", path, diskMtime: r.data.mtime },
      original: r.data.text,
      copy: mine,
      originalMtime: r.data.mtime,
      hunks: hunks(r.data.text, mine),
      choices: {},
      fallback: "copy",
    });
  },

  back: () => set({ ...cleared }),

  choose: (id, choice) => set((s) => ({ choices: { ...s.choices, [id]: choice } })),

  chooseAll: (choice) => set({ choices: {}, fallback: choice }),

  merged: () => {
    const s = get();
    return compose(
      s.hunks,
      new Map(Object.entries(s.choices).map(([k, v]) => [Number(k), v])),
      s.fallback,
      kindOf(s.source),
    );
  },

  resolve: async (how) => {
    const s = get();
    const source = s.source;
    if (!source) return false;
    set({ busy: true, error: null, notice: null });

    if (source.kind === "editor") {
      // Unsaved edits have no file of their own: the decision is written straight over the
      // note, guarded by the version that was read, and the editor reloads what was written.
      const text = how === "keepOriginal" ? null : how === "keepCopy" ? (s.copy ?? "") : s.merged();
      if (text !== null) {
        const w = await commands.noteWrite(source.path, text, source.diskMtime);
        if (w.status === "error") {
          set({ busy: false, error: describeFolioError(w.error) });
          if (w.error.kind === "conflict") await get().compareEditor();
          return false;
        }
      }
      await useEditorStore.getState().reloadFromDisk();
      set({ busy: false, open: false, ...cleared });
      return true;
    }

    let resolution: Resolution;
    if (how === "merge") {
      const text = s.merged();
      // A "combination" that is one side exactly is that side, and says so in the Trash.
      resolution =
        text === s.original
          ? { kind: "keepOriginal" }
          : text === s.copy
            ? { kind: "keepCopy" }
            : { kind: "merge", text };
    } else {
      resolution = { kind: how };
    }
    const r = await commands.conflictResolve(source.conflict.path, resolution, s.originalMtime);
    if (r.status === "error") {
      if (r.error.kind === "conflict") {
        // It changed again while you were looking. Show it as it is now rather than apply a
        // decision made about text that is no longer there.
        await get().select(source.conflict);
        set({
          busy: false,
          notice: "This note changed again while you were deciding. Here it is as it is now.",
        });
        return false;
      }
      set({ busy: false, error: describeFolioError(r.error) });
      return false;
    }
    set({ busy: false, ...cleared });
    await get().refresh();
    return true;
  },
}));
