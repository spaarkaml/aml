import { create } from "zustand";
import { describeFolioError } from "@/features/folio/store";
import { commands } from "@/ipc";
import { docToMarkdown, markdownToDoc, type PmDoc, type PmNode } from "@/lib/markdown";
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
  /** Disk changed under a dirty note (from watcher or a Conflict on save). */
  conflict: { diskMtime: number | null } | null;
  externalChanged: boolean;
  open: (path: string) => Promise<boolean>;
  /** Called by the editor on every transaction with the current document. */
  changed: (doc: PmNode) => void;
  saveNow: () => Promise<boolean>;
  reloadFromDisk: () => Promise<void>;
  overwriteDisk: () => Promise<boolean>;
  noteChangedOnDisk: (path: string) => void;
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
  externalChanged: false,

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
      externalChanged: false,
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
    set({ dirty: false, conflict: null, externalChanged: false });
    await get().open(path);
  },

  overwriteDisk: async () => {
    const { path } = get();
    if (!path || !latest) return false;
    set({ conflict: null, externalChanged: false, mtime: null, dirty: true });
    return get().saveNow();
  },

  noteChangedOnDisk: (path) => {
    if (path !== get().path) return;
    if (get().dirty) set({ externalChanged: true });
    else void get().reloadFromDisk();
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
      externalChanged: false,
    });
  },
}));

// Snapshot of the document at the moment a save started; compared after the write returns.
let latestAtSave: PmNode | null = null;
useEditorStore.subscribe((s, prev) => {
  if (s.saving && !prev.saving) latestAtSave = latest;
});
