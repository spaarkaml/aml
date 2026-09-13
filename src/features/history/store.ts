import { create } from "zustand";
import { useEditorStore } from "@/features/editor/store";
import { describeFolioError } from "@/features/folio/errors";
import { commands, type Snapshot } from "@/ipc";

/** What the selected Snapshot is compared with: the note as it is, or another Snapshot. */
export const NOW = "now";

interface HistoryState {
  open: boolean;
  path: string | null;
  list: Snapshot[];
  /** The note as it is on disk, read when the screen opened. */
  current: string | null;
  selected: string | null;
  against: string;
  /** Text by Snapshot id, filled as they are looked at. A Snapshot never changes. */
  texts: Record<string, string>;
  view: "changes" | "whole";
  labelling: boolean;
  label: string;
  busy: boolean;
  error: string | null;

  show: (opts?: { labelling?: boolean }) => Promise<void>;
  close: () => void;
  select: (id: string) => Promise<void>;
  compareWith: (id: string) => Promise<void>;
  setView: (view: HistoryState["view"]) => void;
  startLabel: () => void;
  setLabel: (label: string) => void;
  cancelLabel: () => void;
  take: () => Promise<boolean>;
  restore: () => Promise<boolean>;
}

const cleared = {
  path: null,
  list: [],
  current: null,
  selected: null,
  against: NOW,
  texts: {},
  view: "changes" as const,
  labelling: false,
  label: "",
  error: null,
};

/**
 * A note's History (ADR-006, WP-4.1): its Snapshots, what changed since each, and putting one
 * back. Everything here acts on the note *on disk*, so the editor is saved first — a restore
 * compared against text that was never written would be comparing against nothing.
 */
export const useHistoryStore = create<HistoryState>()((set, get) => ({
  open: false,
  busy: false,
  ...cleared,

  show: async (opts) => {
    const editor = useEditorStore.getState();
    const path = editor.path;
    if (!path) return;
    set({ ...cleared, open: true, path, busy: true, labelling: !!opts?.labelling });
    if (editor.conflict) {
      set({
        busy: false,
        error: "This note changed on disk while you were editing it. Deal with that first.",
      });
      return;
    }
    if (editor.dirty) await editor.saveNow();
    const [note, list] = await Promise.all([commands.noteRead(path), commands.snapshotsList(path)]);
    if (get().path !== path) return;
    if (note.status === "error" || list.status === "error") {
      const e = note.status === "error" ? note.error : list.status === "error" ? list.error : null;
      set({ busy: false, error: e ? describeFolioError(e) : null });
      return;
    }
    set({ busy: false, current: note.data.text, list: list.data });
    const first = list.data[0];
    if (first && !get().labelling) await get().select(first.id);
  },

  close: () => set({ open: false, busy: false, ...cleared }),

  select: async (id) => {
    set({ selected: id, error: null });
    await load(id);
    // Comparing a Snapshot with itself says nothing.
    if (get().against === id) set({ against: NOW });
  },

  compareWith: async (id) => {
    set({ against: id });
    if (id !== NOW) await load(id);
  },

  setView: (view) => set({ view }),
  startLabel: () => set({ labelling: true, label: "" }),
  setLabel: (label) => set({ label }),
  cancelLabel: () => set({ labelling: false, label: "" }),

  take: async () => {
    const path = get().path;
    if (!path) return false;
    set({ busy: true, error: null });
    const editor = useEditorStore.getState();
    if (editor.path === path && editor.dirty) await editor.saveNow();
    const r = await commands.snapshotTake(path, get().label.trim() || null);
    if (r.status === "error") {
      set({ busy: false, error: describeFolioError(r.error) });
      return false;
    }
    const list = await commands.snapshotsList(path);
    set({
      busy: false,
      labelling: false,
      label: "",
      list: list.status === "ok" ? list.data : [r.data, ...get().list],
    });
    await get().select(r.data.id);
    return true;
  },

  restore: async () => {
    const { path, selected } = get();
    if (!path || !selected) return false;
    set({ busy: true, error: null });
    const editor = useEditorStore.getState();
    if (editor.path === path && editor.dirty) await editor.saveNow();
    if (useEditorStore.getState().conflict) {
      set({ busy: false, error: "This note changed on disk while you were editing it." });
      return false;
    }
    const r = await commands.snapshotRestore(path, selected);
    if (r.status === "error") {
      set({ busy: false, error: describeFolioError(r.error) });
      return false;
    }
    if (useEditorStore.getState().path === path) await useEditorStore.getState().reloadFromDisk();
    get().close();
    return true;
  },
}));

async function load(id: string): Promise<void> {
  const { path, texts } = useHistoryStore.getState();
  if (!path || texts[id] !== undefined) return;
  const r = await commands.snapshotRead(path, id);
  if (useHistoryStore.getState().path !== path) return;
  if (r.status === "error") {
    useHistoryStore.setState({ error: describeFolioError(r.error) });
    return;
  }
  useHistoryStore.setState((s) => ({ texts: { ...s.texts, [id]: r.data } }));
}
