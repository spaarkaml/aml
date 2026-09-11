import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useFolioStore } from "@/features/folio/store";
import { useLayoutStore } from "@/features/layout/store";
import { commands, type Project, type ProjectInfo } from "@/ipc";
import { type DropPlan, dropPlan, nestPlan } from "./project";

/** Which Project screen is up, if any. */
export type ProjectScreen = "dashboard" | "corkboard" | null;
/** What the Corkboard tints its cards by. */
export type ColourBy = "label" | "status" | "none";

interface ProjectState {
  /** Every Project in the Folio, for the Overview and the Browser. */
  list: ProjectInfo[];
  /** The Folio these belong to, so the Project you were in is remembered per Folio. */
  root: string | null;
  byFolio: Record<string, string>;
  /** The Project being worked in — the Binder replaces the Browser while it is set. */
  current: string | null;
  project: Project | null;
  screen: ProjectScreen;
  colourBy: ColourBy;
  error: string | null;

  setRoot: (root: string | null) => void;
  refresh: () => Promise<void>;
  clear: () => void;
  /** Opens a Project: the Binder in the Browser, the dashboard in the page. */
  enter: (path: string, screen?: ProjectScreen) => Promise<void>;
  leave: () => void;
  show: (screen: ProjectScreen) => void;
  setColourBy: (by: ColourBy) => void;
  /** Makes `path` a Project (creating the folder if needed) and opens it. */
  create: (path: string, title?: string) => Promise<boolean>;
  save: (patch: {
    title?: string;
    target?: number | null;
    deadline?: string | null;
  }) => Promise<void>;
  include: (rel: string, include: boolean) => Promise<void>;
  card: (
    note: string,
    patch: { synopsis?: string; label?: string; status?: string },
  ) => Promise<void>;
  /** Drops `from` above or below `to`; moves the file too when it changes part. */
  drop: (from: string, to: string, before: boolean) => Promise<void>;
  /** Drops `from` into the part `folder`, at the end of it. */
  nest: (from: string, folder: string) => Promise<void>;
  /** Puts `rel` straight after `afterRel` in the Binder (the split command's placement). */
  insertAfter: (afterRel: string, rel: string) => Promise<void>;
}

/**
 * Projects (ADR-004, WP-5.1). Which Project you are in is per device and per Folio — it is
 * where you are working, not a fact about the work — so it lives here and in `localStorage`,
 * never in the Folio.
 */
export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      list: [],
      root: null,
      byFolio: {},
      current: null,
      project: null,
      screen: null,
      colourBy: "status",
      error: null,

      setRoot: (root) => {
        const current = root ? (get().byFolio[root] ?? null) : null;
        set({ root, current, project: null, screen: null });
        if (root) {
          void get().refresh();
          if (current) void get().enter(current, null);
        }
      },

      refresh: async () => {
        const r = await commands.projectsList();
        if (r.status === "ok") set({ list: r.data });
        // A Project open in the Binder is re-read too, so a note that arrived over sync
        // appears in it without anyone asking.
        const { current } = get();
        if (!current) return;
        const p = await commands.projectRead(current);
        if (p.status === "ok") set({ project: p.data });
        else set({ current: null, project: null, screen: null });
      },

      clear: () =>
        set({ list: [], current: null, project: null, screen: null, error: null, root: null }),

      enter: async (path, screen = "dashboard") => {
        const r = await commands.projectRead(path);
        if (r.status === "error") {
          set({ error: "That Project could not be opened." });
          return;
        }
        const { root } = get();
        set((s) => ({
          current: path,
          project: r.data,
          screen,
          error: null,
          byFolio: root ? { ...s.byFolio, [root]: path } : s.byFolio,
        }));
        useLayoutStore.getState().setLeftView("folio");
      },

      leave: () => {
        const { root } = get();
        set((s) => {
          const byFolio = { ...s.byFolio };
          if (root) delete byFolio[root];
          return { current: null, project: null, screen: null, byFolio };
        });
      },

      show: (screen) => set({ screen }),
      setColourBy: (colourBy) => set({ colourBy }),

      create: async (path, title) => {
        const r = await commands.projectCreate(path, title ?? "");
        if (r.status === "error") {
          set({ error: "That folder could not be made a Project." });
          return false;
        }
        await useFolioStore.getState().refreshTree();
        await get().refresh();
        await get().enter(path);
        return true;
      },

      save: async (patch) => {
        const { current } = get();
        if (!current) return;
        const r = await commands.projectWrite(
          current,
          patch.title ?? null,
          patch.target === undefined ? null : (patch.target ?? 0),
          patch.deadline === undefined ? null : (patch.deadline ?? ""),
        );
        if (r.status === "ok") set({ project: r.data });
      },

      include: async (rel, include) => {
        const { current } = get();
        if (!current) return;
        const r = await commands.projectInclude(current, rel, include);
        if (r.status === "ok") set({ project: r.data });
      },

      card: async (note, patch) => {
        const { current } = get();
        if (!current) return;
        const r = await commands.projectCardWrite(
          current,
          note,
          patch.synopsis ?? null,
          patch.label ?? null,
          patch.status ?? null,
        );
        if (r.status === "ok") set({ project: r.data });
      },

      drop: async (from, to, before) => {
        const { project } = get();
        if (project) await apply(set, get, dropPlan(project, from, to, before));
      },

      nest: async (from, folder) => {
        const { project } = get();
        if (project) await apply(set, get, nestPlan(project, from, folder));
      },

      insertAfter: async (afterRel, rel) => {
        const { current, project } = get();
        if (!current || !project) return;
        const order = project.binder.map((i) => i.rel).filter((r) => r !== rel);
        const at = order.indexOf(afterRel);
        order.splice(at === -1 ? order.length : at + 1, 0, rel);
        const r = await commands.projectOrder(current, order);
        if (r.status === "ok") set({ project: r.data });
      },
    }),
    {
      name: "aml.project",
      version: 1,
      partialize: (s) => ({ byFolio: s.byFolio, colourBy: s.colourBy }),
    },
  ),
);

/**
 * Carries out a drop: the file move first, because a rename that failed must not leave an
 * order pointing at somewhere the note never went.
 */
async function apply(
  set: (patch: Partial<ProjectState>) => void,
  get: () => ProjectState,
  plan: DropPlan | null,
): Promise<void> {
  const { current } = get();
  if (!plan || !current) return;
  if (plan.move && !(await useFolioStore.getState().rename(plan.move.from, plan.move.to))) return;
  const r = await commands.projectOrder(current, plan.order);
  if (r.status === "ok") set({ project: r.data });
}

/** The Project holding `path`, or null. Reads the list already in the store. */
export function projectOf(list: ProjectInfo[], path: string | null): ProjectInfo | null {
  if (!path) return null;
  return (
    list
      .filter((p) => path.startsWith(`${p.path}/`))
      .sort((a, b) => b.path.length - a.path.length)[0] ?? null
  );
}
