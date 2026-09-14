import { type Ref, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
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

/** The `highlight` that means "the notes in no Bounding". */
export const LOOSE = "\u0000loose";

/** What the screen's zoom buttons reach into the canvas for. */
export interface GraphControls {
  zoom: (factor: number) => void;
  fit: () => void;
}

interface Props {
  graph: Graph;
  /** Bounding id → the colour it was given (ADR-010), for the dots and the key. */
  colours: Map<string, string>;
  /** The note the graph was drawn around, drawn as the one it is about. */
  focus?: string | null;
  /** A Bounding id (or `LOOSE`) to bring forward, everything else set back. */
  highlight?: string | null;
  onOpen: (path: string) => void;
  onRefocus?: (path: string) => void;
  compact?: boolean;
  controls?: Ref<GraphControls>;
}

interface Palette {
  bg: string;
  surface: string;
  text: string;
  primary: string;
  accent: string;
  dark: boolean;
  label: string;
  heading: string;
}

/**
 * Reads the palette out of the stylesheet, so canvas obeys ADR-013 like everything else.
 *
 * Only the plain hex tokens: `--aml-text-2`/`-3` are `color-mix()` strings, which a canvas may
 * not parse, so anything dimmer than the text is the text at a lower `globalAlpha` instead.
 */
function palette(): Palette {
  const root = document.documentElement;
  const style = getComputedStyle(root);
  const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  const family = token("--aml-font-ui", "sans-serif");
  return {
    bg: token("--aml-bg", "#f5f5f7"),
    surface: token("--aml-surface", "#fff"),
    text: token("--aml-text", "#1d1d1f"),
    primary: token("--aml-primary", "#006078"),
    accent: token("--aml-accent", "#e37c78"),
    dark: root.dataset.mode === "ink" || style.colorScheme === "dark",
    label: `${token("--aml-weight-medium", "500")} ${token("--aml-size-xs", "11px")} ${family}`,
    heading: `${token("--aml-weight-semi", "600")} ${token("--aml-size-sm", "12px")} ${family}`,
  };
}

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const easeOut = (t: number) => 1 - (1 - t) ** 3;

/** How far a Bounding's tint reaches past its notes, in graph units: a soft edge, then a core. */
const TERRITORY = [
  { pad: 64, alpha: 0.045 },
  { pad: 40, alpha: 0.06 },
] as const;

/** Farther from the note a graph is drawn around is quieter, so the neighbourhood reads first. */
const DEPTH_FADE = [1, 1, 0.7, 0.48];

/**
 * A graph of a handful of notes is not blown up to fill the screen: past this the dots and
 * the territories stop reading as a map and start reading as a diagram of circles.
 */
const MAX_FIT = 1.5;

/**
 * The link graph, drawn on a canvas (WP-7.3).
 *
 * Canvas rather than SVG because a thousand notes is three thousand DOM nodes that React
 * would have to reconcile sixty times a second while the layout settles. The maths is all in
 * `layout.ts` and tested there; this file is the drawing and the pointer.
 *
 * The picture is a map rather than a hairball: each Bounding is a tinted territory with its
 * name on it, links are soft curves tinted by the territory they stay inside, and names give
 * way to each other instead of piling up. One render loop runs the layout, the camera, the
 * hover and the entrance, and stops as soon as none of them is moving.
 */
export function GraphCanvas({
  graph,
  colours,
  focus = null,
  highlight = null,
  onOpen,
  onRefocus,
  compact = false,
  controls,
}: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const sim = useRef<Sim | null>(null);
  /** Nodes by how much they should keep their name when there is not room for every name. */
  const rank = useRef<LayoutNode[]>([]);
  const widths = useRef(new Map<string, number>());
  const view = useRef({ scale: 1, x: 0, y: 0 });
  /** While true the camera keeps the whole graph in frame; any pan or zoom of yours ends it. */
  const follow = useRef(true);
  /** Where a button asked the camera to go, eased towards. */
  const goal = useRef<{ scale: number; x: number; y: number } | null>(null);
  const running = useRef(false);
  const frame = useRef(0);
  const born = useRef(0);
  const drag = useRef<{ node: LayoutNode | null; x: number; y: number; moved: boolean } | null>(
    null,
  );
  const hovered = useRef<string | null>(null);
  /** The note the card is about — kept while it fades out after the pointer has left. */
  const shown = useRef<string | null>(null);
  const hoverAmt = useRef(0);
  const [hover, setHover] = useState<LayoutNode | null>(null);
  const ink = useRef<Palette | null>(null);
  const still = useRef(false);
  // Props the drawing reads, kept in a ref so a new colour map or a highlight repaints the
  // picture rather than restarting the layout.
  const live = useRef({ colours, focus, highlight, compact });
  live.current = { colours, focus, highlight, compact };

  const margin = compact ? 18 : 72;

  const draw = useCallback(() => {
    const el = canvas.current;
    const state = sim.current;
    if (!el || !state) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    if (!ink.current) ink.current = palette();
    const c = ink.current;
    const { colours, focus, highlight, compact } = live.current;
    const dpr = window.devicePixelRatio || 1;
    const width = el.clientWidth;
    const height = el.clientHeight;
    if (el.width !== Math.round(width * dpr) || el.height !== Math.round(height * dpr)) {
      el.width = Math.round(width * dpr);
      el.height = Math.round(height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const { scale, x: ox, y: oy } = view.current;
    const sx = (v: number) => v * scale + ox;
    const sy = (v: number) => v * scale + oy;
    const appear = still.current ? 1 : easeOut(clamp((performance.now() - born.current) / 520));
    const amt = hoverAmt.current;
    const about = shown.current;
    const lit = about && amt > 0.01 ? neighboursOf(state, about) : null;
    const tint = c.dark ? 1.7 : 1;
    const colourOf = (n: LayoutNode) => (n.cluster ? (colours.get(n.cluster) ?? c.primary) : null);
    const picked = (n: LayoutNode) =>
      !highlight || (highlight === LOOSE ? !n.cluster : n.cluster === highlight);
    const isNear = (n: LayoutNode) => !lit || n.path === about || lit.has(n.path);
    const zoomR = clamp(scale, 0.55, 1.6);

    // 1. A faint dot grid that moves with the picture, so panning feels like moving paper.
    if (!compact) {
      let gap = 24 * scale;
      while (gap < 14) gap *= 2;
      ctx.fillStyle = c.text;
      ctx.globalAlpha = c.dark ? 0.09 : 0.08;
      ctx.beginPath();
      for (let x = ((ox % gap) + gap) % gap; x < width; x += gap) {
        for (let y = ((oy % gap) + gap) % gap; y < height; y += gap)
          ctx.rect(x - 0.6, y - 0.6, 1.2, 1.2);
      }
      ctx.fill();
    }

    // 2. Territories. Every member's circle goes into one path, which fills as a union — so
    // where two notes' circles overlap the tint does not darken, and the Bounding reads as one
    // shape with a soft edge rather than as a pile of discs.
    const groups = new Map<string, LayoutNode[]>();
    for (const n of state.nodes) {
      if (!n.cluster) continue;
      const list = groups.get(n.cluster);
      if (list) list.push(n);
      else groups.set(n.cluster, [n]);
    }
    for (const [id, members] of groups) {
      const on = !highlight || highlight === id;
      const hoverDim =
        lit && !members.some((m) => m.path === about || lit.has(m.path)) ? 1 - 0.6 * amt : 1;
      ctx.fillStyle = colours.get(id) ?? c.primary;
      for (const layer of TERRITORY) {
        ctx.beginPath();
        for (const m of members) {
          const r = radiusOf(m) * zoomR + layer.pad * clamp(scale, 0.45, 1.1);
          ctx.moveTo(sx(m.x) + r, sy(m.y));
          ctx.arc(sx(m.x), sy(m.y), r, 0, Math.PI * 2);
        }
        ctx.globalAlpha = layer.alpha * tint * appear * hoverDim * (highlight ? (on ? 2 : 0.3) : 1);
        ctx.fill();
      }
    }

    // 3. Links: gentle curves, so two lines that cross still read as two. A link that stays
    // inside a Bounding takes its colour; one between Boundings is a neutral thread. The two
    // directions of a pair bend to opposite sides, so neither hides the other.
    ctx.lineCap = "round";
    for (const pass of [0, 1]) {
      for (const e of state.edges) {
        const a = state.nodes[e.from];
        const b = state.nodes[e.to];
        if (!a || !b) continue;
        const near = !!lit && (a.path === about || b.path === about);
        if ((pass === 1) !== near) continue;
        const own = a.cluster && a.cluster === b.cluster ? colourOf(a) : null;
        let alpha = (own ? 0.42 : c.dark ? 0.22 : 0.17) * appear;
        if (!(picked(a) || picked(b))) alpha *= 0.2;
        if (focus)
          alpha *= Math.min(
            DEPTH_FADE[Math.min(a.depth, 3)] ?? 1,
            DEPTH_FADE[Math.min(b.depth, 3)] ?? 1,
          );
        if (lit) alpha = near ? alpha + (0.9 - alpha) * amt : alpha * (1 - 0.8 * amt);
        ctx.strokeStyle = near && amt > 0.35 ? c.primary : (own ?? c.text);
        ctx.globalAlpha = alpha;
        ctx.lineWidth =
          (Math.min(3, 0.8 + Math.log2(e.count + 1) * 0.55) + (near ? 0.7 * amt : 0)) *
          clamp(scale, 0.6, 1.4);
        const ax = sx(a.x);
        const ay = sy(a.y);
        const bx = sx(b.x);
        const by = sy(b.y);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.quadraticCurveTo(
          (ax + bx) / 2 - (by - ay) * 0.1,
          (ay + by) / 2 + (bx - ax) * 0.1,
          bx,
          by,
        );
        ctx.stroke();
      }
    }

    // 4. Notes: a coloured bead with a ring of the page around it, so a dot sitting on a line
    // is visibly on top of it. A note in no Bounding is an open ring — loose, not missing.
    const alphaOf = (n: LayoutNode) =>
      appear *
      (focus ? (DEPTH_FADE[Math.min(n.depth, 3)] ?? 1) : 1) *
      (isNear(n) ? 1 : 1 - 0.8 * amt) *
      (picked(n) ? 1 : 0.22);
    const radius = (n: LayoutNode) =>
      radiusOf(n) * zoomR * (0.4 + 0.6 * appear) * (n.path === focus ? 1.3 : 1);
    const special = (n: LayoutNode) => n.path === focus || n.path === about;
    const bead = (n: LayoutNode) => {
      const x = sx(n.x);
      const y = sy(n.y);
      const r = radius(n);
      const alpha = alphaOf(n);
      const colour = colourOf(n);
      if (n.path === focus) {
        ctx.globalAlpha = alpha * 0.18;
        ctx.fillStyle = c.accent;
        ctx.beginPath();
        ctx.arc(x, y, r + 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = c.accent;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, r + 4.5, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (n.path === about && amt > 0.01) {
        ctx.globalAlpha = alpha * 0.22 * amt;
        ctx.fillStyle = colour ?? c.primary;
        ctx.beginPath();
        ctx.arc(x, y, r + 8 * amt, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = alpha;
      ctx.fillStyle = c.surface;
      ctx.beginPath();
      ctx.arc(x, y, r + 1.75, 0, Math.PI * 2);
      ctx.fill();
      if (colour) {
        ctx.fillStyle = colour;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.globalAlpha = alpha * 0.5;
        ctx.strokeStyle = c.text;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(r - 0.7, 1), 0, Math.PI * 2);
        ctx.stroke();
      }
    };
    for (const n of state.nodes) if (!special(n)) bead(n);
    for (const n of state.nodes) if (special(n)) bead(n);

    // 5. Each Bounding's name, over the top of its territory — the thing you would write on
    // a map by hand. They fade as you zoom right in, when you are inside one anyway.
    ctx.textAlign = "center";
    ctx.lineJoin = "round";
    const placed: Array<[number, number, number, number]> = [];
    if (!compact && groups.size > 0) {
      ctx.font = c.heading;
      ctx.textBaseline = "bottom";
      const zoomFade = 1 - clamp((scale - 1.6) / 0.8);
      for (const [id, members] of groups) {
        let minY = Number.POSITIVE_INFINITY;
        let sumX = 0;
        for (const m of members) {
          minY = Math.min(
            minY,
            m.y -
              (radiusOf(m) * zoomR + (TERRITORY[1]?.pad ?? 0) * clamp(scale, 0.45, 1.1)) / scale,
          );
          sumX += m.x;
        }
        const name = graph.clusters.find((k) => k.id === id)?.name ?? "";
        if (!name) continue;
        const x = sx(sumX / members.length);
        const y = sy(minY);
        const w = ctx.measureText(name).width;
        placed.push([x - w / 2 - 4, y - 17, x + w / 2 + 4, y + 2]);
        const on = !highlight || highlight === id;
        ctx.globalAlpha = appear * zoomFade * (on ? 1 : 0.35);
        ctx.strokeStyle = c.bg;
        ctx.lineWidth = 4;
        ctx.strokeText(name, x, y);
        ctx.fillStyle = colours.get(id) ?? c.primary;
        ctx.fillText(name, x, y);
      }
    }
    // 6. Names, in order of how connected a note is, each placed only where it does not
    // collide with one already down — so zoomed out you read the landmarks, and zooming in
    // makes room for the rest. A soft halo of the ground keeps a name legible over a line.
    ctx.font = c.label;
    ctx.textBaseline = "top";
    const hits = (x0: number, y0: number, x1: number, y1: number) =>
      placed.some(([a0, b0, a1, b1]) => x0 < a1 && x1 > a0 && y0 < b1 && y1 > b0);
    const labelled = [
      ...state.nodes.filter((n) => n.path === focus),
      ...rank.current.filter((n) => n.path !== focus),
    ];
    let tried = 0;
    for (const n of labelled) {
      if (tried > 240) break;
      if (n.path === about && amt > 0.5) continue; // the card is already saying it
      const x = sx(n.x);
      const y = sy(n.y);
      if (x < -80 || x > width + 80 || y < -40 || y > height + 40) continue;
      tried++;
      const label = n.title.length > 28 ? `${n.title.slice(0, 27)}…` : n.title;
      let w = widths.current.get(label);
      if (w === undefined) {
        w = ctx.measureText(label).width;
        widths.current.set(label, w);
      }
      const top = y + radius(n) + 5;
      const box: [number, number, number, number] = [
        x - w / 2 - 3,
        top - 1,
        x + w / 2 + 3,
        top + 14,
      ];
      if (n.path !== focus && hits(...box)) continue;
      placed.push(box);
      const alpha = alphaOf(n) * (n.path === focus ? 1 : 0.92);
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = c.bg;
      ctx.lineWidth = 3.5;
      ctx.strokeText(label, x, top);
      ctx.fillStyle = c.text;
      ctx.fillText(label, x, top);
    }

    ctx.globalAlpha = 1;

    // 7. The card follows its note while the camera moves, without a React render per frame.
    const box = card.current;
    if (box) {
      const n = about ? state.nodes.find((m) => m.path === about) : null;
      if (n && amt > 0.01) {
        const x = sx(n.x);
        const r = radius(n);
        const below = sy(n.y) - r < 84;
        const y = below ? sy(n.y) + r + 12 : sy(n.y) - r - 12;
        box.style.opacity = String(amt);
        box.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, ${below ? "0" : "-100%"}) scale(${0.96 + 0.04 * amt})`;
      } else {
        box.style.opacity = "0";
      }
    }
  }, [graph]);

  const tick = useCallback(() => {
    const state = sim.current;
    const el = canvas.current;
    if (!state || !el) return;
    let moving = false;
    if (running.current) {
      const moved = step(state);
      running.current = moved > SETTLED || state.alpha > 0.15 || !!drag.current?.node;
    }
    const target = follow.current
      ? fitView(bounds(state.nodes), el.clientWidth, el.clientHeight, margin, MAX_FIT)
      : goal.current;
    if (target) {
      const v = view.current;
      const k = still.current ? 1 : 0.14;
      v.scale += (target.scale - v.scale) * k;
      v.x += (target.x - v.x) * k;
      v.y += (target.y - v.y) * k;
      const done =
        Math.abs(target.scale - v.scale) < 0.0005 &&
        Math.abs(target.x - v.x) < 0.3 &&
        Math.abs(target.y - v.y) < 0.3;
      if (!done) moving = true;
      else if (!follow.current) goal.current = null;
    }
    const want = hovered.current ? 1 : 0;
    const diff = want - hoverAmt.current;
    if (Math.abs(diff) < 0.02 || still.current) hoverAmt.current = want;
    else {
      hoverAmt.current += diff * 0.3;
      moving = true;
    }
    if (hoverAmt.current === 0 && !hovered.current) shown.current = null;
    const entering = performance.now() - born.current < 560;
    draw();
    frame.current = running.current || moving || entering ? requestAnimationFrame(tick) : 0;
  }, [draw, margin]);

  const wake = useCallback(() => {
    if (!frame.current) frame.current = requestAnimationFrame(tick);
  }, [tick]);

  const kick = useCallback(
    (alpha = 0.6) => {
      const state = sim.current;
      if (!state) return;
      state.alpha = Math.max(state.alpha, alpha);
      running.current = true;
      wake();
    },
    [wake],
  );

  useImperativeHandle(
    controls,
    () => ({
      zoom: (factor) => {
        const el = canvas.current;
        if (!el) return;
        const from = goal.current ?? view.current;
        const scale = clamp(from.scale * factor, 0.15, 4);
        const cx = el.clientWidth / 2;
        const cy = el.clientHeight / 2;
        const gx = (cx - from.x) / from.scale;
        const gy = (cy - from.y) / from.scale;
        follow.current = false;
        goal.current = { scale, x: cx - gx * scale, y: cy - gy * scale };
        wake();
      },
      fit: () => {
        follow.current = true;
        goal.current = null;
        wake();
      },
    }),
    [wake],
  );

  // A new graph is a new simulation: laid out from its own seed, framed, and brought in.
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    ink.current = palette();
    const state = seed(graph);
    rank.current = [...state.nodes].sort(
      (a, b) => b.degree - a.degree || a.path.localeCompare(b.path),
    );
    still.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Reduced motion gets the finished picture rather than no picture: the same layout,
    // arrived at in one go instead of in front of you.
    // Otherwise the first ticks — when everything is flung apart before it gathers — happen
    // before the first frame, and what you see is the picture arriving, not exploding.
    if (still.current) settle(state);
    else {
      const until = performance.now() + 80;
      for (let i = 0; i < 120 && performance.now() < until; i++) step(state);
    }
    sim.current = state;
    follow.current = true;
    goal.current = null;
    hovered.current = null;
    shown.current = null;
    hoverAmt.current = 0;
    setHover(null);
    born.current = performance.now();
    view.current = fitView(
      bounds(state.nodes),
      el.clientWidth || 800,
      el.clientHeight || 600,
      margin,
      MAX_FIT,
    );
    if (still.current) draw();
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
    // `draw` and `kick` change only with the graph, so only a new graph restarts the layout;
    // a new focus, colour or highlight is a repaint (below).
  }, [graph, draw, kick, margin]);

  // A new focus, colour or highlight is the same picture painted differently.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the props are read through `live`
  useEffect(() => {
    wake();
  }, [colours, focus, highlight, wake]);

  // Ink and Paper are different palettes, and a canvas is not styled by CSS — it has to be
  // told. `data-mode` on the root is what changes when the mode does, and the media query
  // covers "system" following the OS while AML is open.
  useEffect(() => {
    const repaint = () => {
      ink.current = palette();
      widths.current.clear();
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
      if (follow.current)
        view.current = fitView(
          bounds(state.nodes),
          el.clientWidth,
          el.clientHeight,
          margin,
          MAX_FIT,
        );
      draw();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [draw, margin]);

  /** Client pixels → graph coordinates. */
  const toGraph = useCallback((clientX: number, clientY: number) => {
    const el = canvas.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    const { scale, x, y } = view.current;
    return { x: (clientX - rect.left - x) / scale, y: (clientY - rect.top - y) / scale };
  }, []);

  // Scrolling is attached by hand because React's wheel listener is passive, and a pinch has
  // to be kept from zooming the whole window. The Mac convention: two fingers pan, a pinch
  // zooms. A mouse wheel, which only ever scrolls in whole notches, zooms.
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      follow.current = false;
      goal.current = null;
      const pinch = e.ctrlKey || e.metaKey;
      const trackpad = e.deltaMode === 0 && (e.deltaX !== 0 || !Number.isInteger(e.deltaY));
      if (!pinch && trackpad) {
        view.current.x -= e.deltaX;
        view.current.y -= e.deltaY;
      } else {
        const rect = el.getBoundingClientRect();
        const at = toGraph(e.clientX, e.clientY);
        const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
        const factor = Math.exp(-delta * (pinch ? 0.01 : 0.0022));
        const next = clamp(view.current.scale * factor, 0.15, 4);
        // Zoom about the pointer, so the note under it stays under it.
        view.current = {
          scale: next,
          x: e.clientX - rect.left - at.x * next,
          y: e.clientY - rect.top - at.y * next,
        };
      }
      wake();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [toGraph, wake]);

  const hoverTo = (node: LayoutNode | null) => {
    if ((node?.path ?? null) === hovered.current) return;
    hovered.current = node?.path ?? null;
    if (node) {
      shown.current = node.path;
      setHover(node);
    }
    wake();
  };

  const cluster = hover?.cluster ? graph.clusters.find((k) => k.id === hover.cluster) : null;
  const words = hover ? graph.nodes.find((n) => n.path === hover.path)?.words : undefined;

  return (
    <div ref={wrap} className={compact ? styles.compact : styles.wrap}>
      <canvas
        ref={canvas}
        className={styles.canvas}
        data-testid="graph-canvas"
        onPointerDown={(e) => {
          const at = toGraph(e.clientX, e.clientY);
          const node = sim.current ? nodeAt(sim.current.nodes, at.x, at.y) : null;
          drag.current = { node, x: e.clientX, y: e.clientY, moved: false };
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const at = toGraph(e.clientX, e.clientY);
          const held = drag.current;
          if (held) {
            const dx = e.clientX - held.x;
            const dy = e.clientY - held.y;
            if (Math.abs(dx) + Math.abs(dy) > 3) held.moved = true;
            if (!held.moved) return;
            follow.current = false;
            goal.current = null;
            if (held.node) {
              // Dragging a note pins it: you moved it there because that is where you want it.
              held.node.pinned = true;
              held.node.x = at.x;
              held.node.y = at.y;
              kick(0.4);
            } else {
              view.current.x += dx;
              view.current.y += dy;
              wake();
            }
            held.x = e.clientX;
            held.y = e.clientY;
            return;
          }
          hoverTo(sim.current ? nodeAt(sim.current.nodes, at.x, at.y) : null);
        }}
        onPointerUp={(e) => {
          const held = drag.current;
          drag.current = null;
          if (held?.node && !held.moved) {
            if (e.altKey || e.detail >= 2) onRefocus?.(held.node.path);
            else onOpen(held.node.path);
          }
        }}
        onPointerLeave={() => {
          drag.current = null;
          hoverTo(null);
        }}
        aria-label="Link graph"
      />
      <div ref={card} className={styles.card} aria-hidden="true" data-testid="graph-card">
        {hover ? (
          <>
            <span className={styles.cardTitle}>{hover.title}</span>
            <span className={styles.cardMeta}>
              {cluster ? (
                <span
                  className={styles.cardDot}
                  style={{ background: colours.get(cluster.id) ?? undefined }}
                />
              ) : null}
              {[
                cluster?.name,
                `${hover.degree} ${hover.degree === 1 ? "link" : "links"}`,
                words ? `${words.toLocaleString()} ${words === 1 ? "word" : "words"}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
            {compact ? null : (
              <span className={styles.cardHint}>Click to open · ⌥-click to centre here</span>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
