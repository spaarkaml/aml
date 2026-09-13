import { create } from "zustand";
import { describeFolioError } from "@/features/folio/errors";
import { commands } from "@/ipc";
import { diagramToSvg } from "./export";
import { fileNameFor, fromSvg } from "./format";
import {
  addGroup,
  addNode,
  connect,
  type Diagram,
  type DiagramEdge,
  type DiagramGroup,
  type DiagramNode,
  type EdgeKind,
  emptyDiagram,
  extent,
  type GroupShape,
  type NodeKind,
  removeNode,
} from "./model";

export type Selection =
  | { kind: "node"; id: string }
  | { kind: "edge"; id: string }
  | { kind: "group"; id: string }
  | null;

/** What the editor is pointed at: a note, and the file if this diagram already has one. */
interface Target {
  notePath: string;
  /** Note-relative path of the `.svg`, or null when this diagram is not saved yet. */
  assetPath: string | null;
}

interface DiagramState {
  open: boolean;
  doc: Diagram;
  target: Target | null;
  selection: Selection;
  /** The node an edge is being drawn from, while you are dragging one out. */
  linking: string | null;
  tool: NodeKind | "select";
  saving: boolean;
  error: string | null;
  dirty: boolean;
  past: Diagram[];
  future: Diagram[];

  create: (notePath: string) => void;
  edit: (notePath: string, assetPath: string) => Promise<void>;
  close: () => void;
  setTool: (tool: NodeKind | "select") => void;
  select: (selection: Selection) => void;
  setLinking: (id: string | null) => void;

  /** Replaces the document. `record` false for the middle of a drag, true when it settles. */
  apply: (next: Diagram, record?: boolean) => void;
  commit: () => void;
  undo: () => void;
  redo: () => void;

  place: (kind: NodeKind, x: number, y: number) => void;
  placeGroup: (shape: GroupShape, x: number, y: number) => void;
  link: (from: string, to: string, kind?: EdgeKind) => void;
  patchNode: (id: string, patch: Partial<DiagramNode>) => void;
  patchEdge: (id: string, patch: Partial<DiagramEdge>) => void;
  patchGroup: (id: string, patch: Partial<DiagramGroup>) => void;
  removeSelected: () => void;
  /** Named for what it does, and never `fit`: Biome reads `fit(` as a focused test. */
  fitToDrawing: () => void;
  save: () => Promise<{ markdownPath: string; fresh: boolean } | null>;
}

const HISTORY = 60;

/** UTF-8 → base64, in chunks: spreading a 40 kB drawing into `String.fromCharCode` overflows. */
function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export const useDiagramStore = create<DiagramState>()((set, get) => ({
  open: false,
  doc: emptyDiagram(),
  target: null,
  selection: null,
  linking: null,
  tool: "select",
  saving: false,
  error: null,
  dirty: false,
  past: [],
  future: [],

  create: (notePath) =>
    set({
      open: true,
      doc: emptyDiagram(),
      target: { notePath, assetPath: null },
      selection: null,
      linking: null,
      tool: "select",
      error: null,
      dirty: false,
      past: [],
      future: [],
    }),

  edit: async (notePath, assetPath) => {
    set({ open: true, error: null, target: { notePath, assetPath }, saving: true });
    const r = await commands.assetReadText(notePath, assetPath);
    if (r.status === "error") {
      set({ saving: false, error: describeFolioError(r.error) });
      return;
    }
    const doc = fromSvg(r.data);
    if (!doc) {
      // Someone else's SVG, or one AML wrote before it carried its model. Editing it would
      // mean throwing their file away and replacing it with a guess.
      set({ saving: false, error: "This image is not an AML diagram, so it cannot be edited." });
      return;
    }
    set({
      saving: false,
      doc,
      selection: null,
      linking: null,
      tool: "select",
      dirty: false,
      past: [],
      future: [],
    });
  },

  close: () => set({ open: false, linking: null, selection: null, error: null }),
  setTool: (tool) => set({ tool, linking: null }),
  select: (selection) => set({ selection }),
  setLinking: (linking) => set({ linking }),

  apply: (next, record = true) => {
    const { doc, past } = get();
    set({
      doc: next,
      dirty: true,
      future: [],
      past: record ? [...past, doc].slice(-HISTORY) : past,
    });
  },

  // Called when a drag ends: the whole drag is one entry in the history rather than sixty.
  commit: () => {
    const { doc, past } = get();
    const last = past[past.length - 1];
    if (last === doc) return;
    set({ past: [...past, doc].slice(-HISTORY), future: [] });
  },

  undo: () => {
    const { past, future, doc } = get();
    const previous = past[past.length - 1];
    if (!previous) return;
    set({ doc: previous, past: past.slice(0, -1), future: [doc, ...future], dirty: true });
  },

  redo: () => {
    const { past, future, doc } = get();
    const next = future[0];
    if (!next) return;
    set({ doc: next, past: [...past, doc], future: future.slice(1), dirty: true });
  },

  place: (kind, x, y) => {
    const [next, id] = addNode(get().doc, kind, x, y);
    get().apply(next);
    set({ selection: { kind: "node", id }, tool: "select" });
  },

  placeGroup: (shape, x, y) => {
    const [next, id] = addGroup(get().doc, shape, x, y);
    get().apply(next);
    set({ selection: { kind: "group", id }, tool: "select" });
  },

  link: (from, to, kind = "directed") => {
    const before = get().doc;
    const next = connect(before, from, to, kind);
    if (next === before) return;
    get().apply(next);
    const added = next.edges[next.edges.length - 1];
    set({ linking: null, selection: added ? { kind: "edge", id: added.id } : null });
  },

  patchNode: (id, patch) => {
    const doc = get().doc;
    get().apply({
      ...doc,
      nodes: doc.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
    });
  },

  patchEdge: (id, patch) => {
    const doc = get().doc;
    get().apply({
      ...doc,
      edges: doc.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    });
  },

  patchGroup: (id, patch) => {
    const doc = get().doc;
    get().apply({
      ...doc,
      groups: doc.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)),
    });
  },

  removeSelected: () => {
    const { doc, selection } = get();
    if (!selection) return;
    if (selection.kind === "node") get().apply(removeNode(doc, selection.id));
    else if (selection.kind === "edge")
      get().apply({ ...doc, edges: doc.edges.filter((e) => e.id !== selection.id) });
    else get().apply({ ...doc, groups: doc.groups.filter((g) => g.id !== selection.id) });
    set({ selection: null });
  },

  fitToDrawing: () => {
    const doc = get().doc;
    get().apply({ ...doc, ...extent(doc) });
  },

  save: async () => {
    const { doc, target } = get();
    if (!target) return null;
    set({ saving: true, error: null });
    const svg = diagramToSvg(doc);
    if (target.assetPath) {
      const r = await commands.assetWriteText(target.notePath, target.assetPath, svg);
      if (r.status === "error") {
        set({ saving: false, error: describeFolioError(r.error) });
        return null;
      }
      set({ saving: false, dirty: false });
      return { markdownPath: target.assetPath, fresh: false };
    }
    // A new diagram is written through the same assets path an image takes, so it lands
    // beside the note's other attachments and is referenced the same way.
    const base64 = toBase64(svg);
    const r = await commands.assetWrite(target.notePath, fileNameFor(doc), base64);
    if (r.status === "error") {
      set({ saving: false, error: describeFolioError(r.error) });
      return null;
    }
    set({
      saving: false,
      dirty: false,
      target: { notePath: target.notePath, assetPath: r.data.markdownPath },
    });
    return { markdownPath: r.data.markdownPath, fresh: true };
  },
}));
