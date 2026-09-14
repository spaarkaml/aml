import type { Graph, GraphNode } from "@/ipc";

/**
 * The force layout behind the link graph (WP-7.3).
 *
 * Everything here is arithmetic on arrays — no canvas, no React — so the one thing a graph
 * has to get right can be tested: notes that link to each other end up near each other, and
 * notes in the same Bounding end up together.
 *
 * Four forces, in the order they are applied each tick:
 *   1. **Repulsion** keeps notes off each other. Computed against a grid rather than every
 *      other node, because a thousand notes is half a million pairs a frame otherwise.
 *   2. **Springs** pull linked notes together, harder the more links there are.
 *   3. **Bounding gravity** pulls each note towards the middle of its own Bounding. This is
 *      what makes the picture cluster rather than only tangle.
 *   4. **Centring** keeps the whole thing from drifting off the canvas.
 *
 * The simulation cools: every tick `alpha` decays, so it settles instead of shivering for
 * ever, and `settle` runs it to the end in one go for tests and for reduced motion.
 */

export interface LayoutNode {
  path: string;
  title: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Links either way: what the dot's size is drawn from. */
  degree: number;
  cluster: string | null;
  depth: number;
  /** Dragged by hand: forces still apply to everything else, but this one stays put. */
  pinned: boolean;
}

export interface LayoutEdge {
  /** Indices into `nodes` — the layout never looks a path up in an inner loop. */
  from: number;
  to: number;
  count: number;
}

export interface Sim {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  /** Falls from 1 to 0 as the layout settles. */
  alpha: number;
}

export interface Forces {
  /** How hard notes push each other apart. */
  repulsion: number;
  /** How far apart repulsion still reaches. Also the grid's cell size. */
  range: number;
  /** How hard a link pulls, per link. */
  spring: number;
  /** The length a single link is happy at. */
  restLength: number;
  /** How hard a Bounding pulls its own notes together. */
  cluster: number;
  /** How hard two Boundings push each other apart, centre to centre. */
  separation: number;
  /** How hard everything is pulled to the middle. */
  centre: number;
  /** How much speed survives a tick. */
  damping: number;
  /** How fast the simulation cools. */
  cooling: number;
}

export const FORCES: Forces = {
  repulsion: 5200,
  range: 220,
  spring: 0.02,
  restLength: 90,
  cluster: 0.075,
  separation: 90_000,
  centre: 0.008,
  damping: 0.82,
  cooling: 0.985,
};

/** Below this the picture has stopped moving in any way an eye would notice. */
export const SETTLED = 0.02;

/** A dot's radius: busier notes are bigger, but sub-linearly — degree 100 is not 100× wider. */
export function radiusOf(node: { degree: number }): number {
  return 4 + Math.sqrt(node.degree) * 2.4;
}

/** A small deterministic hash, so a Folio lays out the same way every time it is opened. */
function hash(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return h;
}

/**
 * Starting positions: a golden-angle spiral, with each Bounding given its own quarter of the
 * circle to start in.
 *
 * A random start would settle just as well and look different every time, and a graph that
 * rearranges itself between openings is one you have to re-read from scratch each time.
 */
export function seed(graph: Graph): Sim {
  const index = new Map<string, number>();
  graph.nodes.forEach((n, i) => {
    index.set(n.path, i);
  });
  const clusters = [...new Set(graph.nodes.map((n) => n.cluster).filter(Boolean))].sort();
  const golden = Math.PI * (3 - Math.sqrt(5));

  const nodes: LayoutNode[] = graph.nodes.map((n: GraphNode, i) => {
    const at = n.cluster ? clusters.indexOf(n.cluster) : -1;
    const spread = at === -1 ? 0 : ((at + 1) / (clusters.length + 1)) * Math.PI * 2;
    const angle = i * golden + spread + (hash(n.path) % 100) / 400;
    const radius = 30 + Math.sqrt(i + 1) * 26;
    return {
      path: n.path,
      title: n.title,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      vx: 0,
      vy: 0,
      degree: n.outgoing + n.incoming,
      cluster: n.cluster,
      depth: n.depth,
      pinned: false,
    };
  });

  const edges: LayoutEdge[] = [];
  for (const e of graph.edges) {
    const from = index.get(e.from);
    const to = index.get(e.to);
    if (from !== undefined && to !== undefined) edges.push({ from, to, count: e.count });
  }
  return { nodes, edges, alpha: 1 };
}

/** The middle of each Bounding as it stands this tick. */
function centroids(nodes: LayoutNode[]): Map<string, { x: number; y: number; n: number }> {
  const out = new Map<string, { x: number; y: number; n: number }>();
  for (const node of nodes) {
    if (!node.cluster) continue;
    const at = out.get(node.cluster) ?? { x: 0, y: 0, n: 0 };
    at.x += node.x;
    at.y += node.y;
    at.n += 1;
    out.set(node.cluster, at);
  }
  for (const at of out.values()) {
    at.x /= at.n;
    at.y /= at.n;
  }
  return out;
}

/** Buckets nodes by grid cell, so repulsion only looks at the nodes that are actually near. */
function grid(nodes: LayoutNode[], cell: number): Map<string, number[]> {
  const out = new Map<string, number[]>();
  nodes.forEach((n, i) => {
    const key = `${Math.floor(n.x / cell)},${Math.floor(n.y / cell)}`;
    const bucket = out.get(key);
    if (bucket) bucket.push(i);
    else out.set(key, [i]);
  });
  return out;
}

/** One tick. Mutates `sim` and returns how much everything moved. */
export function step(sim: Sim, forces: Forces = FORCES): number {
  const { nodes, edges } = sim;
  const f = forces;
  const cells = grid(nodes, f.range);
  const middles = centroids(nodes);

  // 1. Repulsion, against the eight cells around each node and its own.
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    if (!a) continue;
    const cx = Math.floor(a.x / f.range);
    const cy = Math.floor(a.y / f.range);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const j of cells.get(`${cx + dx},${cy + dy}`) ?? []) {
          if (j <= i) continue;
          const b = nodes[j];
          if (!b) continue;
          let ox = a.x - b.x;
          let oy = a.y - b.y;
          let d2 = ox * ox + oy * oy;
          if (d2 > f.range * f.range) continue;
          if (d2 < 0.01) {
            // Two notes exactly on top of each other have no direction to push in, so they
            // are given one from their names — the same one every time.
            ox = ((hash(a.path) % 100) - 50) / 50 || 0.5;
            oy = ((hash(b.path) % 100) - 50) / 50 || 0.5;
            d2 = ox * ox + oy * oy;
          }
          const d = Math.sqrt(d2);
          const push = (f.repulsion / d2) * sim.alpha;
          const ux = (ox / d) * push;
          const uy = (oy / d) * push;
          a.vx += ux;
          a.vy += uy;
          b.vx -= ux;
          b.vy -= uy;
        }
      }
    }
  }

  // 2. Springs along the links.
  for (const e of edges) {
    const a = nodes[e.from];
    const b = nodes[e.to];
    if (!a || !b) continue;
    const ox = b.x - a.x;
    const oy = b.y - a.y;
    const d = Math.hypot(ox, oy) || 0.01;
    // More links between two notes is a shorter, stronger spring, but not without limit.
    const strength = f.spring * (1 + Math.log2(e.count + 1) * 0.5);
    const pull = (d - f.restLength) * strength * sim.alpha;
    const ux = (ox / d) * pull;
    const uy = (oy / d) * pull;
    a.vx += ux;
    a.vy += uy;
    b.vx -= ux;
    b.vy -= uy;
  }

  // 3. Boundings push each other apart, so they settle as separate blobs rather than as one
  // even spread with the right neighbours. Applied to the members, since a centroid is not a
  // thing that can move on its own.
  const ids = [...middles.keys()];
  const drift = new Map<string, { x: number; y: number }>(ids.map((id) => [id, { x: 0, y: 0 }]));
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = middles.get(ids[i] ?? "");
      const b = middles.get(ids[j] ?? "");
      if (!a || !b) continue;
      const ox = a.x - b.x;
      const oy = a.y - b.y;
      const d = Math.max(Math.hypot(ox, oy), 1);
      const push = (f.separation / (d * d)) * sim.alpha;
      const ux = (ox / d) * push;
      const uy = (oy / d) * push;
      const da = drift.get(ids[i] ?? "");
      const db = drift.get(ids[j] ?? "");
      if (da) {
        da.x += ux;
        da.y += uy;
      }
      if (db) {
        db.x -= ux;
        db.y -= uy;
      }
    }
  }

  // 4 and 5. Bounding gravity, then the middle of the canvas.
  for (const node of nodes) {
    const home = node.cluster ? middles.get(node.cluster) : undefined;
    if (home) {
      node.vx += (home.x - node.x) * f.cluster * sim.alpha;
      node.vy += (home.y - node.y) * f.cluster * sim.alpha;
      const away = node.cluster ? drift.get(node.cluster) : undefined;
      if (away) {
        node.vx += away.x;
        node.vy += away.y;
      }
    }
    node.vx += -node.x * f.centre * sim.alpha;
    node.vy += -node.y * f.centre * sim.alpha;
  }

  // Move, and cool.
  let moved = 0;
  for (const node of nodes) {
    if (node.pinned) {
      node.vx = 0;
      node.vy = 0;
      continue;
    }
    node.vx *= f.damping;
    node.vy *= f.damping;
    node.x += node.vx;
    node.y += node.vy;
    moved += Math.abs(node.vx) + Math.abs(node.vy);
  }
  sim.alpha *= f.cooling;
  return nodes.length === 0 ? 0 : moved / nodes.length;
}

/** Runs the simulation to a standstill (or `max` ticks), for tests and for reduced motion. */
export function settle(sim: Sim, max = 400, forces: Forces = FORCES): Sim {
  for (let i = 0; i < max; i++) {
    if (step(sim, forces) < SETTLED && i > 30) break;
  }
  return sim;
}

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** What the drawing covers, with room for the biggest dot at each edge. */
export function bounds(nodes: LayoutNode[]): Box {
  if (nodes.length === 0) return { minX: -1, minY: -1, maxX: 1, maxY: 1 };
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const n of nodes) {
    const r = radiusOf(n);
    minX = Math.min(minX, n.x - r);
    minY = Math.min(minY, n.y - r);
    maxX = Math.max(maxX, n.x + r);
    maxY = Math.max(maxY, n.y + r);
  }
  return { minX, minY, maxX, maxY };
}

/** The scale and offset that fit `box` into a `width × height` canvas with a margin. */
export function fitView(
  box: Box,
  width: number,
  height: number,
  margin = 28,
  maxScale = 2.2,
): { scale: number; x: number; y: number } {
  const w = Math.max(box.maxX - box.minX, 1);
  const h = Math.max(box.maxY - box.minY, 1);
  const scale = Math.min((width - margin * 2) / w, (height - margin * 2) / h, maxScale);
  return {
    scale,
    x: width / 2 - ((box.minX + box.maxX) / 2) * scale,
    y: height / 2 - ((box.minY + box.maxY) / 2) * scale,
  };
}

/** The node under a point in graph coordinates, or null. */
export function nodeAt(nodes: LayoutNode[], x: number, y: number, slack = 4): LayoutNode | null {
  let best: LayoutNode | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  for (const n of nodes) {
    const d = Math.hypot(n.x - x, n.y - y);
    if (d <= radiusOf(n) + slack && d < bestD) {
      best = n;
      bestD = d;
    }
  }
  return best;
}

/** Every node one step from `path`, for lighting up a hovered note's neighbours. */
export function neighboursOf(sim: Sim, path: string): Set<string> {
  const out = new Set<string>();
  const at = sim.nodes.findIndex((n) => n.path === path);
  if (at === -1) return out;
  for (const e of sim.edges) {
    if (e.from === at) out.add(sim.nodes[e.to]?.path ?? "");
    if (e.to === at) out.add(sim.nodes[e.from]?.path ?? "");
  }
  out.delete("");
  return out;
}
