import { create } from "zustand";
import { persist } from "zustand/middleware";
import { describeFolioError } from "@/features/folio/errors";
import { commands, type Graph } from "@/ipc";

export type Scope = "folio" | "note";

interface GraphState {
  open: boolean;
  /** The whole Folio, or the neighbourhood of one note. */
  scope: Scope;
  /** How many steps out from the focus note; only used by the "note" scope. */
  depth: number;
  /** The note the local graph is drawn around — usually the open one, until you follow one. */
  focus: string | null;
  graph: Graph | null;
  loading: boolean;
  error: string | null;
  setOpen: (open: boolean) => void;
  setScope: (scope: Scope) => void;
  setDepth: (depth: number) => void;
  /** Draws the graph around a different note without leaving the screen. */
  refocus: (path: string) => Promise<void>;
  load: (focus?: string | null) => Promise<void>;
}

export const DEPTHS = [1, 2, 3] as const;

export const useGraphStore = create<GraphState>()(
  persist(
    (set, get) => ({
      open: false,
      scope: "folio",
      depth: 2,
      focus: null,
      graph: null,
      loading: false,
      error: null,

      setOpen: (open) => set({ open, error: null }),
      setScope: (scope) => {
        set({ scope });
        void get().load();
      },
      setDepth: (depth) => {
        set({ depth });
        if (get().scope === "note") void get().load();
      },
      refocus: async (path) => {
        set({ scope: "note", focus: path });
        await get().load(path);
      },

      load: async (focus) => {
        const { scope, depth } = get();
        const at = focus !== undefined ? focus : get().focus;
        if (scope === "note" && !at) {
          set({ graph: null, error: null });
          return;
        }
        set({ loading: true, error: null });
        const r = await commands.graphBuild(scope === "note" ? at : null, depth);
        if (r.status === "error") {
          set({ loading: false, error: describeFolioError(r.error), graph: null });
          return;
        }
        set({ loading: false, graph: r.data });
      },
    }),
    {
      name: "aml.graph",
      version: 1,
      // Which graph you like looking at is this machine's business (ADR-004); the graph
      // itself is derived and is rebuilt from the index every time it is opened.
      partialize: (s) => ({ scope: s.scope, depth: s.depth }),
    },
  ),
);
