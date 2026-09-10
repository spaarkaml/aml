import { create } from "zustand";
import { commandRegistry } from "@/features/commands/registry";
import { useEditorStore } from "@/features/editor/store";
import { useLayoutStore } from "@/features/layout/store";
import { type Bounding, commands, type ProjectInfo } from "@/ipc";

/** Offered when a Bounding's colour is edited; the first six are what Rust hands out. */
export const BOUNDING_COLOURS = [
  "#006078",
  "#e37c78",
  "#82bac4",
  "#7a5c9e",
  "#4c8b5a",
  "#c08a2e",
  "#1f2a2e",
];

interface BoundingsState {
  list: Bounding[];
  projects: ProjectInfo[];
  /** The Bounding whose notes are listed, if any. */
  selected: string | null;
  /** The Bounding being edited in the panel, if any. */
  editing: string | null;
  /** True while a new Bounding is being named; it is not created until it is saved. */
  draft: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  clear: () => void;
  startDraft: () => void;
  cancelDraft: () => void;
  /** Creates a Bounding from the draft. The id is slugged from this name, so it is only
   *  written once the name is real — no "new-bounding" ids left behind. */
  create: (name: string, patch?: { colour?: string; icon?: string }) => Promise<string | null>;
  update: (id: string, patch: { name?: string; colour?: string; icon?: string }) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Adds or removes notes; `paths` defaults to the open note. */
  add: (id: string, paths?: string[]) => Promise<void>;
  take: (id: string, paths?: string[]) => Promise<void>;
  select: (id: string | null) => void;
  edit: (id: string | null) => void;
  /** Opens the left panel on Boundings, with `id` selected when given. */
  show: (id?: string | null) => void;
}

let unregister: (() => void) | null = null;

/** "Add to Bounding: Academic" for each Bounding, rebuilt whenever the list changes. */
function syncCommands(list: Bounding[]): void {
  unregister?.();
  unregister = null;
  if (list.length === 0) return;
  unregister = commandRegistry.register(
    ...list.map((b) => ({
      id: `bounding.add.${b.id}`,
      title: `Add to Bounding: ${b.name}`,
      group: "Note",
      run: () => void useBoundingsStore.getState().add(b.id),
    })),
  );
}

export const useBoundingsStore = create<BoundingsState>((set, get) => ({
  list: [],
  projects: [],
  selected: null,
  editing: null,
  draft: false,
  error: null,

  refresh: async () => {
    const [b, p] = await Promise.all([commands.boundingsList(), commands.projectsList()]);
    if (b.status === "ok") {
      set({ list: b.data });
      syncCommands(b.data);
    }
    if (p.status === "ok") set({ projects: p.data });
  },

  clear: () => {
    syncCommands([]);
    set({ list: [], projects: [], selected: null, editing: null, draft: false, error: null });
  },

  startDraft: () => set({ draft: true, editing: null, error: null }),
  cancelDraft: () => set({ draft: false }),

  create: async (name, patch) => {
    const r = await commands.boundingCreate(name);
    if (r.status !== "ok") {
      set({ error: "That Bounding could not be created." });
      return null;
    }
    if (patch?.colour || patch?.icon) await get().update(r.data.id, patch);
    else await get().refresh();
    set({ selected: r.data.id, draft: false, error: null });
    return r.data.id;
  },

  update: async (id, patch) => {
    const r = await commands.boundingUpdate(
      id,
      patch.name ?? null,
      patch.colour ?? null,
      patch.icon ?? null,
    );
    if (r.status === "ok") {
      set({ list: r.data });
      syncCommands(r.data);
    }
  },

  remove: async (id) => {
    const r = await commands.boundingDelete(id);
    if (r.status !== "ok") return;
    set((s) => ({
      list: r.data,
      selected: s.selected === id ? null : s.selected,
      editing: s.editing === id ? null : s.editing,
    }));
    syncCommands(r.data);
  },

  add: async (id, paths) => {
    const target = paths ?? openNote();
    if (target.length === 0) return;
    const r = await commands.boundingAdd(id, target);
    if (r.status === "ok") {
      set({ list: r.data });
      syncCommands(r.data);
    }
  },

  take: async (id, paths) => {
    const target = paths ?? openNote();
    if (target.length === 0) return;
    const r = await commands.boundingRemove(id, target);
    if (r.status === "ok") {
      set({ list: r.data });
      syncCommands(r.data);
    }
  },

  select: (selected) => set((s) => ({ selected: s.selected === selected ? null : selected })),
  edit: (editing) => set({ editing }),

  show: (id) => {
    if (id !== undefined) set({ selected: id });
    useLayoutStore.getState().setLeftView("boundings");
    useLayoutStore.getState().openPanel("left");
  },
}));

function openNote(): string[] {
  const path = useEditorStore.getState().path;
  return path ? [path] : [];
}

/** The Boundings holding `path`. */
export function boundingsOf(list: Bounding[], path: string | null): Bounding[] {
  return path ? list.filter((b) => b.notes.includes(path)) : [];
}
