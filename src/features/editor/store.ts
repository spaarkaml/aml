import { create } from "zustand";
import { describeFolioError } from "@/features/folio/errors";
import { commands } from "@/ipc";
import { docToMarkdown, markdownToDoc, type PmDoc, type PmNode } from "@/lib/markdown";
import { remapPath } from "@/lib/paths";
import { countWords } from "@/lib/wordcount";

export const SAVE_DEBOUNCE_MS = 1000;

interface EditorState {
  path: string | null;
  /** Document loaded from disk; the live editor takes it from here. */
  doc: PmDoc | null;
  /** Bumped whenever `doc` is replaced from disk so the editor knows to reload content. */
  docVersion: number;
  mtime: number | null;
  dirty: boolean;
  saving: boolean;
  words: number;
  error: string | null;
  /** A save was refused because the file on disk is not the one we read. */
  conflict: { diskMtime: number | null } | null;
  open: (path: string) => Promise<boolean>;
  /** Called by the editor on every transaction with the current document. */
  changed: (doc: PmNode) => void;
  saveNow: () => Promise<boolean>;
  reloadFromDisk: () => Promise<void>;
  overwriteDisk: () => Promise<boolean>;
  noteChangedOnDisk: (path: string) => void;
  /** The open note (or a folder above it) was renamed by us; keep following the file. */
  renamed: (from: string, to: string) => void;
  close: () => Promise<void>;
}

let timer: ReturnType<typeof setTimeout> | null = null;
let latest: PmNode | null = null;

function cancelTimer() {
  if (timer) clearTimeout(timer);
  timer = null;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  path: null,
  doc: null,
  docVersion: 0,
  mtime: null,
  dirty: false,
  saving: false,
  words: 0,
  error: null,
  conflict: null,

  open: async (path) => {
    if (get().dirty) await get().saveNow();
    cancelTimer();
    const r = await commands.noteRead(path);
    if (r.status === "error") {
      set({ error: describeFolioError(r.error) });
      return false;
    }
    const doc = markdownToDoc(r.data.text);
    latest = doc;
    set((s) => ({
      path,
      doc,
      docVersion: s.docVersion + 1,
      mtime: r.data.mtime,
      dirty: false,
      words: countWords(doc),
      error: null,
      conflict: null,
    }));
    return true;
  },

  changed: (doc) => {
    latest = doc;
    // Keep `doc` current (without bumping docVersion) so a remounted editor resumes from
    // the latest text rather than the on-disk copy.
    set({ doc: doc as PmDoc, dirty: true, words: countWords(doc) });
    cancelTimer();
    timer = setTimeout(() => {
      timer = null;
      void get().saveNow();
    }, SAVE_DEBOUNCE_MS);
  },

  saveNow: async () => {
    const { path, mtime, dirty, conflict } = get();
    if (!path || !latest || !dirty || conflict) return false;
    cancelTimer();
    set({ saving: true });
    const text = docToMarkdown(latest);
    const r = await commands.noteWrite(path, text, mtime);
    if (r.status === "error") {
      if (r.error.kind === "conflict") {
        set({ saving: false, conflict: { diskMtime: r.error.detail.disk_mtime } });
      } else {
        set({ saving: false, error: describeFolioError(r.error) });
      }
      return false;
    }
    // Only clear dirty if nothing changed while the write was in flight.
    set((s) => ({ saving: false, mtime: r.data.mtime, dirty: s.dirty && latest !== latestAtSave }));
    return true;
  },

  reloadFromDisk: async () => {
    const path = get().path;
    if (!path) return;
    set({ dirty: false, conflict: null });
    await get().open(path);
  },

  overwriteDisk: async () => {
    const { path } = get();
    if (!path || !latest) return false;
    set({ conflict: null, mtime: null, dirty: true });
    return get().saveNow();
  },

  noteChangedOnDisk: (path) => {
    if (path !== get().path) return;
    // A dirty note is deliberately left alone. Our own atomic write trips the watcher exactly
    // as a foreign edit does, and the watcher's 300 ms debounce means that event always lands
    // *after* the write finished — so anything raised here fires on every pause in typing and
    // is almost never real. The guard that matters is `expected_mtime` on the next save: if
    // the file really did move, the write is refused and `conflict` is set from a comparison
    // against the file itself rather than guessed from an event.
    if (get().saving || get().dirty) return;
    void commands.noteRead(path).then((r) => {
      if (get().path !== path || get().dirty) return;
      if (r.status === "ok" && r.data.mtime === get().mtime) return;
      void get().reloadFromDisk();
    });
  },

  renamed: (from, to) => {
    const path = get().path;
    if (!path) return;
    const next = remapPath(path, from, to);
    if (next !== path) set({ path: next });
  },

  close: async () => {
    if (get().dirty && !get().conflict) await get().saveNow();
    cancelTimer();
    latest = null;
    set({
      path: null,
      doc: null,
      mtime: null,
      dirty: false,
      words: 0,
      conflict: null,
    });
  },
}));

// Snapshot of the document at the moment a save started; compared after the write returns.
let latestAtSave: PmNode | null = null;
useEditorStore.subscribe((s, prev) => {
  if (s.saving && !prev.saving) latestAtSave = latest;
});
