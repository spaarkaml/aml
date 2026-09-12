import { useCallback, useEffect, useRef, useState } from "react";
import type { Graph } from "@/ipc";
import styles from "./GraphCanvas.module.css";
import {
  bounds,
  fitView,
  type LayoutNode,
  neighboursOf,
  nodeAt,
  radiusOf,
  SETTLED,
  type Sim,
  seed,
  settle,
  step,
} from "./layout";

interface Props {
  graph: Graph;
  /** Bounding id → the colour it was given (ADR-010), for the dots and the key. */
  colours: Map<string, string>;
  /** The note the graph was drawn around, drawn as the one it is about. */
  focus?: string | null;
  onOpen: (path: string) => void;
  onRefocus?: (path: string) => void;
  compact?: boolean;
}

interface Palette {
  text: string;
  dim: string;
  line: string;
  primary: string;
  surface: string;
  accent: string;
}

/** Reads the palette out of the stylesheet, so canvas obeys ADR-013 like everything else. */
function palette(): Palette {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string) => style.getPropertyValue(name).trim() || "#888";
  return {
    text: token("--aml-text"),
    dim: token("--aml-text-3"),
    line: token("--aml-muted"),
    primary: token("--aml-primary"),
    surface: token("--aml-surface"),
    accent: token("--aml-accent"),
  };
}

/**
 * The link graph, drawn on a canvas (WP-7.3).
 *
 * Canvas rather than SVG because a thousand notes is three thousand DOM nodes that React
 * would have to reconcile sixty times a second while the layout settles. The maths is all in
 * `layout.ts` and tested there; this file is the drawing and the pointer.
 */
export function GraphCanvas({ graph, colours, focus, onOpen, onRefocus, compact = false }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const sim = useRef<Sim | null>(null);
  const view = useRef({ scale: 1, x: 0, y: 0 });
  const frame = useRef(0);
  const drag = useRef<{ node: LayoutNode | null; x: number; y: number; moved: boolean } | null>(
    null,
  );
  const [hover, setHover] = useState<string | null>(null);
  const hovered = useRef<string | null>(null);
  const ink = useRef(palette());

  const draw = useCallback(() => {
    const el = canvas.current;
    const state = sim.current;
    if (!el || !state) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const width = el.clientWidth;
    const height = el.clientHeight;
    if (el.width !== Math.round(width * dpr) || el.height !== Math.round(height * dpr)) {
      el.width = Math.round(width * dpr);
      el.height = Math.round(height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const c = ink.current;
    const { scale, x: ox, y: oy } = view.current;
    const sx = (v: number) => v * scale + ox;
    const sy = (v: number) => v * scale + oy;
    const lit = hovered.current ? neighboursOf(state, hovered.current) : null;

    // Edges first, so a dot always sits on top of its own lines.
    ctx.lineCap = "round";
    for (const e of state.edges) {
      const a = state.nodes[e.from];
      const b = state.nodes[e.to];
      if (!a || !b) continue;
      const near = !lit || a.path === hovered.current || b.path === hovered.current;
      ctx.strokeStyle = near ? c.primary : c.line;
      ctx.globalAlpha = lit ? (near ? 0.75 : 0.12) : 0.45;
      ctx.lineWidth = Math.min(3, 0.6 + Math.log2(e.count + 1) * 0.5) * Math.min(scale, 1.4);
      ctx.beginPath();
      ctx.moveTo(sx(a.x), sy(a.y));
      ctx.lineTo(sx(b.x), sy(b.y));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    const labelAll = state.nodes.length <= (compact ? 24 : 60) || scale > 1.1;
    for (const n of state.nodes) {
      const r = radiusOf(n) * Math.min(Math.max(scale, 0.55), 1.6);
      const isFocus = n.path === focus;
      const near = !lit || n.path === hovered.current || lit.has(n.path);
      ctx.globalAlpha = lit && !near ? 0.2 : 1;
      ctx.fillStyle = n.cluster ? (colours.get(n.cluster) ?? c.primary) : c.dim;
      ctx.beginPath();
      ctx.arc(sx(n.x), sy(n.y), r, 0, Math.PI * 2);
      ctx.fill();
      if (isFocus || n.path === hovered.current) {
        ctx.strokeStyle = isFocus ? c.accent : c.text;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      if (labelAll || isFocus || n.path === hovered.current) {
        ctx.globalAlpha = lit && !near ? 0.25 : 1;
        ctx.fillStyle = c.text;
        ctx.font = `${compact ? 10 : 11}px ${getComputedStyle(document.documentElement).getPropertyValue("--aml-font-ui") || "sans-serif"}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        const label = n.title.length > 28 ? `${n.title.slice(0, 27)}…` : n.title;
        ctx.fillText(label, sx(n.x), sy(n.y) + r + 3);
      }
      ctx.globalAlpha = 1;
    }
  }, [colours, compact, focus]);

  const tick = useCallback(() => {
    const state = sim.current;
    if (!state) return;
    const moved = step(state);
    draw();
    if (moved > SETTLED || state.alpha > 0.15 || drag.current) {
      frame.current = requestAnimationFrame(tick);
    } else {
      frame.current = 0;
    }
  }, [draw]);

  const kick = useCallback(
    (alpha = 0.6) => {
      const state = sim.current;
      if (!state) return;
      state.alpha = Math.max(state.alpha, alpha);
      if (!frame.current) frame.current = requestAnimationFrame(tick);
    },
    [tick],
  );

  // A new graph is a new simulation: laid out from its own seed, then fitted to the canvas.
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    ink.current = palette();
    const state = seed(graph);
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Reduced motion gets the finished picture rather than no picture: the same layout,
    // arrived at in one go instead of in front of you.
    if (still) settle(state);
    sim.current = state;
    const box = bounds(state.nodes);
    view.current = fitView(box, el.clientWidth || 800, el.clientHeight || 600);
    if (still) draw();
    else kick(1);
    if (import.meta.env.DEV) {
      // Exposed for e2e only: a canvas has no elements to click, so the suite asks where a
      // note ended up. The same trick `__amlEditor` uses for ProseMirror.
      (
        window as unknown as { __amlGraphAt?: (path: string) => { x: number; y: number } | null }
      ).__amlGraphAt = (path) => {
        const node = sim.current?.nodes.find((n) => n.path === path);
        const box = canvas.current?.getBoundingClientRect();
        if (!node || !box) return null;
        const { scale, x, y } = view.current;
        return { x: box.left + node.x * scale + x, y: box.top + node.y * scale + y };
      };
    }
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [graph, draw, kick]);

  // Ink and Paper are different palettes, and a canvas is not styled by CSS — it has to be
  // told. `data-mode` on the root is what changes when the mode does, and the media query
  // covers "system" following the OS while AML is open.
  useEffect(() => {
    const repaint = () => {
      ink.current = palette();
      draw();
    };
    const observer = new MutationObserver(repaint);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-mode", "style"],
    });
    const system = window.matchMedia("(prefers-color-scheme: dark)");
    system.addEventListener("change", repaint);
    return () => {
      observer.disconnect();
      system.removeEventListener("change", repaint);
    };
  }, [draw]);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      const state = sim.current;
      if (!state) return;
      view.current = fitView(bounds(state.nodes), el.clientWidth, el.clientHeight);
      draw();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [draw]);

  /** Canvas pixels → graph coordinates. */
  const toGraph = (e: React.PointerEvent | React.MouseEvent | React.WheelEvent) => {
    const el = canvas.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    const { scale, x, y } = view.current;
    return {
      x: (e.clientX - rect.left - x) / scale,
      y: (e.clientY - rect.top - y) / scale,
    };
  };

  return (
    <canvas
      ref={canvas}
      className={compact ? styles.compact : styles.canvas}
      data-testid="graph-canvas"
      onPointerDown={(e) => {
        const at = toGraph(e);
        const node = sim.current ? nodeAt(sim.current.nodes, at.x, at.y) : null;
        drag.current = { node, x: e.clientX, y: e.clientY, moved: false };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const at = toGraph(e);
        const held = drag.current;
        if (held) {
          const dx = e.clientX - held.x;
          const dy = e.clientY - held.y;
          if (Math.abs(dx) + Math.abs(dy) > 3) held.moved = true;
          if (held.node) {
            // Dragging a note pins it: you moved it there because that is where you want it.
            held.node.pinned = true;
            held.node.x = at.x;
            held.node.y = at.y;
            kick(0.4);
          } else {
            view.current.x += dx;
            view.current.y += dy;
            draw();
          }
          held.x = e.clientX;
          held.y = e.clientY;
          return;
        }
        const over = sim.current ? nodeAt(sim.current.nodes, at.x, at.y) : null;
        if ((over?.path ?? null) !== hovered.current) {
          hovered.current = over?.path ?? null;
          setHover(over?.path ?? null);
          draw();
        }
      }}
      onPointerUp={(e) => {
        const held = drag.current;
        drag.current = null;
        if (held?.node && !held.moved) {
          if (e.detail >= 2) onRefocus?.(held.node.path);
          else onOpen(held.node.path);
        }
      }}
      onPointerLeave={() => {
        drag.current = null;
        if (hovered.current) {
          hovered.current = null;
          setHover(null);
          draw();
        }
      }}
      onWheel={(e) => {
        const at = toGraph(e);
        const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
        const next = Math.min(4, Math.max(0.15, view.current.scale * factor));
        const el = canvas.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        // Zoom about the pointer, so the note under it stays under it.
        view.current = {
          scale: next,
          x: e.clientX - rect.left - at.x * next,
          y: e.clientY - rect.top - at.y * next,
        };
        draw();
      }}
      title={hover ?? undefined}
      aria-label="Link graph"
    />
  );
}
