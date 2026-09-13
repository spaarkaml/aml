import { useEffect, useRef, useState } from "react";
import { DiagramBody } from "./DiagramBody";
import styles from "./DiagramScreen.module.css";
import { stylesheet } from "./format";
import {
  centre,
  contains,
  type DiagramEdge,
  type DiagramGroup,
  type DiagramNode,
  membersOf,
} from "./model";
import { useDiagramStore } from "./store";

/** Where a new thing lands and how far a drag moves: a small grid, so drawings stay tidy. */
const GRID = 4;
const HANDLE = 5;
const MIN = 36;

function snap(v: number): number {
  return Math.round(v / GRID) * GRID;
}

interface Point {
  x: number;
  y: number;
}

type Drag =
  | { mode: "pan"; x: number; y: number }
  | { mode: "move"; id: string; dx: number; dy: number }
  | { mode: "group"; id: string; dx: number; dy: number; members: Map<string, Point> }
  | { mode: "resize"; id: string; kind: "node" | "group" }
  | { mode: "link"; from: string };

function near(a: Point, b: Point, radius: number): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) <= radius;
}

/** Distance from a point to a segment — how an edge, which has no area, is clicked. */
function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

function handlesFor(n: DiagramNode): Point[] {
  return [
    { x: n.x + n.w / 2, y: n.y },
    { x: n.x + n.w, y: n.y + n.h / 2 },
    { x: n.x + n.w / 2, y: n.y + n.h },
    { x: n.x, y: n.y + n.h / 2 },
  ];
}

/**
 * The drawing surface (WP-7.1).
 *
 * The picture is `DiagramBody` — exactly what the exported file contains — and this adds only
 * what an editor needs on top: selection, handles and a grid. Keeping the two apart is what
 * makes the `.svg` in your Folio the thing you were looking at rather than a second rendering
 * of it.
 *
 * All pointer handling is on the root, with hit-testing in `pick` rather than a handler on
 * every shape: the drawing is then just a drawing, and the order things are picked in is one
 * list you can read instead of whatever the DOM happened to stack.
 */
export function DiagramStage() {
  const doc = useDiagramStore((s) => s.doc);
  const tool = useDiagramStore((s) => s.tool);
  const selection = useDiagramStore((s) => s.selection);
  const linking = useDiagramStore((s) => s.linking);
  const store = useDiagramStore;
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const [view, setView] = useState({ scale: 1, x: 40, y: 40 });
  const [ghost, setGhost] = useState<Point | null>(null);

  // A drawing opens fitted to the stage rather than in a corner.
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    if (!box.width) return;
    const scale = Math.max(
      0.3,
      Math.min(1, (box.width - 48) / doc.width, (box.height - 48) / doc.height),
    );
    setView({
      scale,
      x: (box.width - doc.width * scale) / 2,
      y: (box.height - doc.height * scale) / 2,
    });
    // Only when the editor is handed a differently sized drawing, never on every edit.
  }, [doc.width, doc.height]);

  // Exposed for e2e only: the stage is one SVG with no element per shape, so the suite has
  // to ask where a shape ended up — the same arrangement `__amlGraphAt` uses for the graph.
  const viewRef = useRef(view);
  viewRef.current = view;
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (
      window as unknown as {
        __amlDiagramAt?: (id: string) => { x: number; y: number; w: number; h: number } | null;
      }
    ).__amlDiagramAt = (id) => {
      const box = svg.current?.getBoundingClientRect();
      const n = useDiagramStore.getState().doc.nodes.find((it) => it.id === id);
      if (!box || !n) return null;
      const v = viewRef.current;
      return {
        x: box.left + n.x * v.scale + v.x,
        y: box.top + n.y * v.scale + v.y,
        w: n.w * v.scale,
        h: n.h * v.scale,
      };
    };
  }, []);

  const at = (e: { clientX: number; clientY: number }): Point => {
    const box = svg.current?.getBoundingClientRect();
    if (!box) return { x: 0, y: 0 };
    return {
      x: (e.clientX - box.left - view.x) / view.scale,
      y: (e.clientY - box.top - view.y) / view.scale,
    };
  };

  const nodeUnder = (p: Point): DiagramNode | null => {
    for (let i = doc.nodes.length - 1; i >= 0; i -= 1) {
      const n = doc.nodes[i];
      if (n && contains(n, p)) return n;
    }
    return null;
  };

  const edgeUnder = (p: Point): DiagramEdge | null => {
    const slack = 8 / view.scale;
    for (let i = doc.edges.length - 1; i >= 0; i -= 1) {
      const e = doc.edges[i];
      const a = doc.nodes.find((n) => n.id === e?.from);
      const b = doc.nodes.find((n) => n.id === e?.to);
      if (e && a && b && distanceToSegment(p, centre(a), centre(b)) <= slack) return e;
    }
    return null;
  };

  const groupUnder = (p: Point): DiagramGroup | null => {
    for (let i = doc.groups.length - 1; i >= 0; i -= 1) {
      const g = doc.groups[i];
      if (g && contains(g, p)) return g;
    }
    return null;
  };

  const selectedNode =
    selection?.kind === "node" ? doc.nodes.find((n) => n.id === selection.id) : undefined;
  const selectedGroup =
    selection?.kind === "group" ? doc.groups.find((g) => g.id === selection.id) : undefined;
  const from = linking ? doc.nodes.find((n) => n.id === linking) : undefined;

  /** What a press at `p` starts. Read top-down: handles beat shapes, shapes beat the page. */
  const pick = (p: Point): Drag | null => {
    const grab = (HANDLE + 4) / view.scale;
    if (selectedNode) {
      if (
        near(
          p,
          { x: selectedNode.x + selectedNode.w + 4, y: selectedNode.y + selectedNode.h + 4 },
          grab,
        )
      ) {
        return { mode: "resize", id: selectedNode.id, kind: "node" };
      }
      for (const h of handlesFor(selectedNode)) {
        if (near(p, h, grab)) return { mode: "link", from: selectedNode.id };
      }
    }
    if (
      selectedGroup &&
      near(p, { x: selectedGroup.x + selectedGroup.w, y: selectedGroup.y + selectedGroup.h }, grab)
    ) {
      return { mode: "resize", id: selectedGroup.id, kind: "group" };
    }
    const node = nodeUnder(p);
    if (node) return { mode: "move", id: node.id, dx: p.x - node.x, dy: p.y - node.y };
    return null;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const p = at(e);
    const s = store.getState();
    if (tool !== "select") {
      s.place(tool, snap(p.x), snap(p.y));
      return;
    }

    const started = pick(p);
    if (started) {
      if (started.mode === "move") s.select({ kind: "node", id: started.id });
      if (started.mode === "link") {
        s.setLinking(started.from);
        setGhost(p);
      }
      drag.current = started;
      svg.current?.setPointerCapture(e.pointerId);
      return;
    }

    const edge = edgeUnder(p);
    if (edge) {
      s.select({ kind: "edge", id: edge.id });
      return;
    }

    const group = groupUnder(p);
    if (group) {
      s.select({ kind: "group", id: group.id });
      const members = new Map(membersOf(s.doc, group).map((n) => [n.id, { x: n.x, y: n.y }]));
      drag.current = { mode: "group", id: group.id, dx: p.x - group.x, dy: p.y - group.y, members };
      svg.current?.setPointerCapture(e.pointerId);
      return;
    }

    s.select(null);
    s.setLinking(null);
    drag.current = { mode: "pan", x: e.clientX, y: e.clientY };
    svg.current?.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const held = drag.current;
    if (!held) return;
    const p = at(e);
    const s = store.getState();

    if (held.mode === "pan") {
      setView((v) => ({ ...v, x: v.x + (e.clientX - held.x), y: v.y + (e.clientY - held.y) }));
      held.x = e.clientX;
      held.y = e.clientY;
      return;
    }
    if (held.mode === "move") {
      s.patchNode(held.id, { x: snap(p.x - held.dx), y: snap(p.y - held.dy) });
      return;
    }
    if (held.mode === "group") {
      const g = s.doc.groups.find((it) => it.id === held.id);
      if (!g) return;
      const x = snap(p.x - held.dx);
      const y = snap(p.y - held.dy);
      const shiftX = x - g.x;
      const shiftY = y - g.y;
      // Moving a system moves what is standing in it: the circle is the point of the circle.
      const nodes = s.doc.nodes.map((n) => {
        const was = held.members.get(n.id);
        return was ? { ...n, x: snap(was.x + shiftX), y: snap(was.y + shiftY) } : n;
      });
      s.apply(
        {
          ...s.doc,
          nodes,
          groups: s.doc.groups.map((it) => (it.id === held.id ? { ...it, x, y } : it)),
        },
        false,
      );
      return;
    }
    if (held.mode === "resize") {
      const item =
        held.kind === "node"
          ? s.doc.nodes.find((n) => n.id === held.id)
          : s.doc.groups.find((g) => g.id === held.id);
      if (!item) return;
      const w = Math.max(MIN, snap(p.x - item.x));
      const h = Math.max(MIN, snap(p.y - item.y));
      if (held.kind === "node") s.patchNode(held.id, { w, h });
      else s.patchGroup(held.id, { w, h });
      return;
    }
    setGhost(p);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const held = drag.current;
    drag.current = null;
    setGhost(null);
    if (!held) return;
    const s = store.getState();
    if (held.mode === "link") {
      const over = nodeUnder(at(e));
      s.setLinking(null);
      if (over && over.id !== held.from) s.link(held.from, over.id);
      return;
    }
    if (held.mode !== "pan") s.commit();
  };

  return (
    <svg
      ref={svg}
      className={`${styles.canvas} ${tool === "select" ? "" : styles.placing}`}
      data-testid="diagram-stage"
      aria-label="Diagram"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={() => {
        document.querySelector<HTMLElement>("[data-diagram-text]")?.focus();
      }}
      onWheel={(e) => {
        const p = at(e);
        const box = svg.current?.getBoundingClientRect();
        if (!box) return;
        const next = Math.min(3, Math.max(0.25, view.scale * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
        // Zoom about the pointer, so what is under it stays under it.
        setView({
          scale: next,
          x: e.clientX - box.left - p.x * next,
          y: e.clientY - box.top - p.y * next,
        });
      }}
    >
      <title>Diagram</title>
      {/* The stylesheet the exported file carries, plus the app's own ink and paper so the
          drawing follows Appearance while you are working on it. */}
      <style>{`${stylesheet()} svg{--ink:var(--aml-text);--paper:var(--aml-surface);--line:var(--aml-muted)}`}</style>
      <defs>
        <pattern id="aml-diagram-grid" width={24} height={24} patternUnits="userSpaceOnUse">
          <circle cx={1} cy={1} r={1} fill="var(--line)" fillOpacity={0.6} />
        </pattern>
      </defs>
      <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
        <rect
          width={doc.width}
          height={doc.height}
          rx={8}
          fill="var(--paper)"
          stroke="var(--line)"
        />
        <rect width={doc.width} height={doc.height} rx={8} fill="url(#aml-diagram-grid)" />

        <DiagramBody diagram={doc} />

        {selectedGroup ? (
          <>
            <rect
              x={selectedGroup.x}
              y={selectedGroup.y}
              width={selectedGroup.w}
              height={selectedGroup.h}
              fill="none"
              stroke="var(--aml-primary)"
              strokeWidth={1.5 / view.scale}
              strokeDasharray="4 3"
            />
            <circle
              cx={selectedGroup.x + selectedGroup.w}
              cy={selectedGroup.y + selectedGroup.h}
              r={HANDLE / view.scale}
              fill="var(--aml-primary)"
            />
          </>
        ) : null}

        {selectedNode ? (
          <>
            <rect
              x={selectedNode.x - 4}
              y={selectedNode.y - 4}
              width={selectedNode.w + 8}
              height={selectedNode.h + 8}
              rx={6}
              fill="none"
              stroke="var(--aml-primary)"
              strokeWidth={1.5 / view.scale}
            />
            {handlesFor(selectedNode).map((h) => (
              <circle
                key={`${h.x},${h.y}`}
                cx={h.x}
                cy={h.y}
                r={HANDLE / view.scale}
                fill="var(--aml-surface)"
                stroke="var(--aml-primary)"
                strokeWidth={1.5 / view.scale}
              />
            ))}
            <circle
              cx={selectedNode.x + selectedNode.w + 4}
              cy={selectedNode.y + selectedNode.h + 4}
              r={HANDLE / view.scale}
              fill="var(--aml-primary)"
            />
          </>
        ) : null}

        {from && ghost ? (
          <line
            x1={centre(from).x}
            y1={centre(from).y}
            x2={ghost.x}
            y2={ghost.y}
            stroke="var(--aml-primary)"
            strokeWidth={1.8 / view.scale}
            strokeDasharray="5 4"
          />
        ) : null}
      </g>
    </svg>
  );
}
