/**
 * The diagram model (WP-7.1).
 *
 * A diagram is nodes, edges and groups with real coordinates: you put things where they mean
 * something, and nothing moves them afterwards. That is the whole reason this exists instead
 * of a Mermaid fence — a formulation, a genogram or a causal loop is a *positional* drawing,
 * and an auto-layout engine destroys the meaning it is supposed to carry.
 *
 * Everything here is pure and has no opinion about how it is drawn. `Shapes.tsx` draws it and
 * `format.ts` writes it down; both are tested against this.
 */

/** What a node *is*. The shape follows from the kind, so the drawing cannot contradict it. */
export type NodeKind =
  // People and actors
  | "person"
  | "self"
  | "people"
  | "institution"
  // Mind
  | "belief"
  | "feeling"
  | "behaviour"
  | "body"
  // World
  | "event"
  | "channel"
  | "message"
  | "outcome"
  | "note";

/** How one thing bears on another. */
export type EdgeKind =
  | "directed"
  | "mutual"
  | "inhibits"
  | "weak"
  | "flow"
  | "close"
  | "conflict"
  | "cutoff"
  | "plain";

export type GroupShape = "circle" | "rect";

/**
 * A colour by name, never by value: the name is what the file stores, so a diagram drawn
 * today still resolves through whatever `tokens.css` says tomorrow (ADR-013).
 */
export type Tone =
  | "neutral"
  | "teal"
  | "salmon"
  | "purple"
  | "green"
  | "amber"
  | "blue"
  | "magenta"
  | "sea"
  | "rust"
  | "olive"
  | "cyan"
  | "slate";

export const TONES: Tone[] = [
  "neutral",
  "teal",
  "salmon",
  "purple",
  "green",
  "amber",
  "blue",
  "magenta",
  "sea",
  "rust",
  "olive",
  "cyan",
  "slate",
];

/**
 * The literal each tone resolves to when the diagram is read outside AML.
 *
 * These are the Corkboard's colours (`features/project/project.ts`), which were chosen to be
 * distinguishable from one another; `neutral` is the only one that follows the reader's
 * light/dark setting, because it is structure rather than a decision.
 */
export const TONE_HEX: Record<Exclude<Tone, "neutral">, string> = {
  teal: "#006078",
  salmon: "#e37c78",
  purple: "#7a5c9e",
  green: "#4c8b5a",
  amber: "#c08a2e",
  blue: "#2f6fb3",
  magenta: "#b0447a",
  sea: "#3f9b8e",
  rust: "#b5562f",
  olive: "#7d8b2f",
  cyan: "#82bac4",
  slate: "#6d7b8c",
};

export interface DiagramNode {
  id: string;
  kind: NodeKind;
  /** Top-left corner and size, in diagram units (which are CSS px at zoom 1). */
  x: number;
  y: number;
  w: number;
  h: number;
  tone: Tone;
  text: string;
}

export interface DiagramEdge {
  id: string;
  from: string;
  to: string;
  kind: EdgeKind;
  tone: Tone;
  /** Drawn in a gap in the middle of the line. `+` and `-` are how a causal loop reads. */
  label: string;
}

/** A container drawn behind everything: the "big circle" around a family, a cell, a system. */
export interface DiagramGroup {
  id: string;
  shape: GroupShape;
  x: number;
  y: number;
  w: number;
  h: number;
  tone: Tone;
  text: string;
}

export interface Diagram {
  /** The drawing's own size. The exported SVG's viewBox, and what compile lays out against. */
  width: number;
  height: number;
  groups: DiagramGroup[];
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

export function emptyDiagram(): Diagram {
  return { width: 720, height: 520, groups: [], nodes: [], edges: [] };
}

interface KindInfo {
  label: string;
  /** What the palette groups it under. */
  family: "People" | "Mind" | "World";
  w: number;
  h: number;
  tone: Tone;
  /** The word that goes in a new one of these, so a fresh node is never a blank box. */
  placeholder: string;
}

/**
 * The symbol set. Sizes are defaults for a new node — everything is resizable afterwards.
 *
 * The People row is the genogram vocabulary (an individual, the index person, a household,
 * an institution); Mind is the formulation vocabulary (the four boxes of a hot-cross-bun);
 * World is what acts on a person from outside, which is where an influence diagram lives.
 */
export const KINDS: Record<NodeKind, KindInfo> = {
  person: { label: "Person", family: "People", w: 96, h: 96, tone: "teal", placeholder: "Person" },
  self: { label: "Subject", family: "People", w: 96, h: 96, tone: "teal", placeholder: "Subject" },
  people: { label: "Group", family: "People", w: 128, h: 88, tone: "teal", placeholder: "Group" },
  institution: {
    label: "Institution",
    family: "People",
    w: 148,
    h: 76,
    tone: "slate",
    placeholder: "Institution",
  },
  belief: { label: "Belief", family: "Mind", w: 156, h: 72, tone: "purple", placeholder: "Belief" },
  feeling: {
    label: "Feeling",
    family: "Mind",
    w: 144,
    h: 76,
    tone: "salmon",
    placeholder: "Feeling",
  },
  behaviour: {
    label: "Behaviour",
    family: "Mind",
    w: 156,
    h: 68,
    tone: "green",
    placeholder: "Behaviour",
  },
  body: { label: "Body", family: "Mind", w: 140, h: 48, tone: "rust", placeholder: "Sensation" },
  event: { label: "Event", family: "World", w: 148, h: 86, tone: "amber", placeholder: "Event" },
  channel: {
    label: "Channel",
    family: "World",
    w: 156,
    h: 64,
    tone: "blue",
    placeholder: "Channel",
  },
  message: {
    label: "Message",
    family: "World",
    w: 156,
    h: 68,
    tone: "magenta",
    placeholder: "Narrative",
  },
  outcome: {
    label: "Outcome",
    family: "World",
    w: 156,
    h: 68,
    tone: "sea",
    placeholder: "Outcome",
  },
  note: { label: "Note", family: "World", w: 168, h: 44, tone: "neutral", placeholder: "Note" },
};

export const EDGE_LABELS: Record<EdgeKind, string> = {
  directed: "Influences",
  mutual: "Both ways",
  inhibits: "Suppresses",
  weak: "Tenuous",
  flow: "Transmits",
  close: "Close",
  conflict: "Conflict",
  cutoff: "Cut off",
  plain: "Line",
};

/** Ids are short and stable; only uniqueness inside one diagram matters. */
export function nextId(prefix: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  for (let i = 1; ; i += 1) {
    const id = `${prefix}${i}`;
    if (!used.has(id)) return id;
  }
}

export function addNode(d: Diagram, kind: NodeKind, x: number, y: number): [Diagram, string] {
  const info = KINDS[kind];
  const id = nextId(
    "n",
    d.nodes.map((n) => n.id),
  );
  const node: DiagramNode = {
    id,
    kind,
    // Placed by its centre: you point at where you want the thing, not at its corner.
    x: Math.round(x - info.w / 2),
    y: Math.round(y - info.h / 2),
    w: info.w,
    h: info.h,
    tone: info.tone,
    text: info.placeholder,
  };
  return [{ ...d, nodes: [...d.nodes, node] }, id];
}

export function addGroup(d: Diagram, shape: GroupShape, x: number, y: number): [Diagram, string] {
  const id = nextId(
    "g",
    d.groups.map((g) => g.id),
  );
  const w = shape === "circle" ? 300 : 320;
  const h = shape === "circle" ? 300 : 220;
  const group: DiagramGroup = {
    id,
    shape,
    x: Math.round(x - w / 2),
    y: Math.round(y - h / 2),
    w,
    h,
    tone: "slate",
    text: "System",
  };
  // Groups are drawn behind, biggest first, so a small one inside a big one stays visible.
  const groups = [...d.groups, group].sort((a, b) => b.w * b.h - a.w * a.h);
  return [{ ...d, groups }, id];
}

export function connect(
  d: Diagram,
  from: string,
  to: string,
  kind: EdgeKind = "directed",
): Diagram {
  if (from === to) return d;
  const id = nextId(
    "e",
    d.edges.map((e) => e.id),
  );
  return { ...d, edges: [...d.edges, { id, from, to, kind, tone: "neutral", label: "" }] };
}

/** Removing a node takes its edges with it: an edge to nothing is not a drawing, it is a bug. */
export function removeNode(d: Diagram, id: string): Diagram {
  return {
    ...d,
    nodes: d.nodes.filter((n) => n.id !== id),
    edges: d.edges.filter((e) => e.from !== id && e.to !== id),
  };
}

export function centre(n: { x: number; y: number; w: number; h: number }): {
  x: number;
  y: number;
} {
  return { x: n.x + n.w / 2, y: n.y + n.h / 2 };
}

export function contains(
  box: { x: number; y: number; w: number; h: number },
  p: { x: number; y: number },
): boolean {
  return p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h;
}

/** Which nodes a group holds, by their centres — a group is a place, not a list. */
export function membersOf(d: Diagram, group: DiagramGroup): DiagramNode[] {
  return d.nodes.filter((n) => contains(group, centre(n)));
}

/**
 * Where the line between two nodes should stop: on the boundary of the shape rather than at
 * its centre, so an arrowhead touches the box instead of hiding under it.
 *
 * Circles and ellipses get the real intersection; everything else is treated as its bounding
 * rectangle, which is exact for the rectangles and close enough for a diamond to look right.
 */
export function anchor(
  node: DiagramNode,
  towards: { x: number; y: number },
): {
  x: number;
  y: number;
} {
  const c = centre(node);
  const dx = towards.x - c.x;
  const dy = towards.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const rx = node.w / 2;
  const ry = node.h / 2;
  const round = node.kind === "person" || node.kind === "self" || node.kind === "feeling";
  if (round) {
    const t = 1 / Math.hypot(dx / rx, dy / ry);
    return { x: c.x + dx * t, y: c.y + dy * t };
  }
  const t = Math.min(rx / Math.abs(dx || 1e-6), ry / Math.abs(dy || 1e-6));
  return { x: c.x + dx * t, y: c.y + dy * t };
}

/** The smallest box holding everything, with room to breathe. Used by "Fit to drawing". */
export function extent(d: Diagram, margin = 32): { width: number; height: number } {
  let right = 0;
  let bottom = 0;
  for (const item of [...d.nodes, ...d.groups]) {
    right = Math.max(right, item.x + item.w);
    bottom = Math.max(bottom, item.y + item.h);
  }
  return {
    width: Math.max(320, Math.round(right + margin)),
    height: Math.max(240, Math.round(bottom + margin)),
  };
}
