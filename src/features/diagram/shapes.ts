/**
 * The geometry behind the drawing (WP-7.1): shape outlines, line ends and text wrapping.
 *
 * Kept apart from the components so it can be tested without a DOM, and so the editor and
 * the exported file cannot drift — both draw from these numbers.
 */

import { anchor, centre, type DiagramEdge, type DiagramNode, type NodeKind } from "./model";

export const TEXT_SIZE = 13;
export const LINE_HEIGHT = 16;
export const GROUP_TEXT = 12;
export const EDGE_TEXT = 11;
/** Inter's lower-case average, near enough. Used by both sides, so both wrap identically. */
const CHAR_WIDTH = 0.545;

/**
 * Breaks a label into lines that fit `width`.
 *
 * Measured by arithmetic rather than by the browser on purpose: the exported SVG is written
 * without a layout engine, so if wrapping asked the DOM the file would not match what you
 * drew. A word longer than the line is left to overhang rather than hyphenated blindly.
 */
export function wrapText(text: string, width: number, size = TEXT_SIZE): string[] {
  const max = Math.max(1, Math.floor(width / (size * CHAR_WIDTH)));
  const out: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (candidate.length <= max || !line) {
        line = candidate;
      } else {
        out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  // Four lines is where a node stops being a label and starts being a paragraph.
  return out.slice(0, 4);
}

/** The outline of a node, as an SVG path. Every kind is one path so selection is one hit. */
export function outlineOf(node: DiagramNode): string {
  const { x, y, w, h, kind } = node;
  const r = (radius: number) => Math.min(radius, w / 2, h / 2);
  switch (kind) {
    case "person":
    case "self":
    case "feeling":
      return ellipsePath(x + w / 2, y + h / 2, w / 2, h / 2);
    case "people": {
      // Two overlapping ellipses: a household, a crowd, a faction.
      const rx = w * 0.32;
      const ry = h / 2;
      return ellipsePath(x + rx, y + ry, rx, ry) + ellipsePath(x + w - rx, y + ry, rx, ry);
    }
    case "institution": {
      const cut = Math.min(22, w * 0.16);
      return polygon([
        [x + cut, y],
        [x + w - cut, y],
        [x + w, y + h / 2],
        [x + w - cut, y + h],
        [x + cut, y + h],
        [x, y + h / 2],
      ]);
    }
    case "event":
      return polygon([
        [x + w / 2, y],
        [x + w, y + h / 2],
        [x + w / 2, y + h],
        [x, y + h / 2],
      ]);
    case "channel": {
      const skew = Math.min(24, w * 0.16);
      return polygon([
        [x + skew, y],
        [x + w, y],
        [x + w - skew, y + h],
        [x, y + h],
      ]);
    }
    case "message": {
      const point = Math.min(20, w * 0.14);
      return polygon([
        [x + point, y],
        [x + w, y],
        [x + w, y + h],
        [x + point, y + h],
        [x, y + h / 2],
      ]);
    }
    case "body":
      return roundedRect(x, y, w, h, h / 2);
    case "belief":
      return roundedRect(x, y, w, h, r(22));
    case "behaviour":
    case "outcome":
      return roundedRect(x, y, w, h, r(6));
    default:
      return roundedRect(x, y, w, h, r(6));
  }
}

/** The second outline some kinds carry: the index person and an outcome are both doubled. */
export function innerOutlineOf(node: DiagramNode): string | null {
  const inset = 6;
  if (node.kind === "self") {
    return ellipsePath(
      node.x + node.w / 2,
      node.y + node.h / 2,
      node.w / 2 - inset,
      node.h / 2 - inset,
    );
  }
  if (node.kind === "outcome") {
    return roundedRect(
      node.x + inset,
      node.y + inset,
      node.w - inset * 2,
      node.h - inset * 2,
      Math.min(4, node.w / 2),
    );
  }
  return null;
}

/** Kinds drawn with no outline at all — a note is an annotation, not a box. */
export function isBare(kind: NodeKind): boolean {
  return kind === "note";
}

function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  return `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${rx * 2} 0a${rx} ${ry} 0 1 0 ${-rx * 2} 0`;
}

function polygon(points: [number, number][]): string {
  return `${points.map(([px, py], i) => `${i ? "L" : "M"}${round(px)} ${round(py)}`).join("")}Z`;
}

function roundedRect(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  return [
    `M${round(x + rr)} ${round(y)}`,
    `H${round(x + w - rr)}`,
    `A${rr} ${rr} 0 0 1 ${round(x + w)} ${round(y + rr)}`,
    `V${round(y + h - rr)}`,
    `A${rr} ${rr} 0 0 1 ${round(x + w - rr)} ${round(y + h)}`,
    `H${round(x + rr)}`,
    `A${rr} ${rr} 0 0 1 ${round(x)} ${round(y + h - rr)}`,
    `V${round(y + rr)}`,
    `A${rr} ${rr} 0 0 1 ${round(x + rr)} ${round(y)}`,
    "Z",
  ].join("");
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}

export interface EdgeGeometry {
  a: { x: number; y: number };
  b: { x: number; y: number };
  /** The drawn line, which is a zigzag for conflict and a straight run for everything else. */
  path: string;
  mid: { x: number; y: number };
  /** Decorations at each end, already positioned and rotated. */
  heads: { d: string; filled: boolean }[];
  dashed: boolean;
  /** A second line beside the first: the genogram's "close" bond. */
  twin: string | null;
  /** The two short strokes across the middle that mean the tie is cut. */
  cut: string | null;
  width: number;
}

const HEAD = 9;

export function edgeGeometry(edge: DiagramEdge, from: DiagramNode, to: DiagramNode): EdgeGeometry {
  const a = anchor(from, centre(to));
  const b = anchor(to, centre(from));
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const heads: { d: string; filled: boolean }[] = [];
  let path = `M${round(a.x)} ${round(a.y)}L${round(b.x)} ${round(b.y)}`;
  let twin: string | null = null;
  let cut: string | null = null;
  let width = 1.6;

  switch (edge.kind) {
    case "directed":
    case "weak":
      heads.push({ d: arrowHead(b, angle, HEAD), filled: true });
      break;
    case "flow":
      width = 3.4;
      heads.push({ d: arrowHead(b, angle, HEAD * 1.5), filled: true });
      break;
    case "mutual":
      heads.push({ d: arrowHead(b, angle, HEAD), filled: true });
      heads.push({ d: arrowHead(a, angle + Math.PI, HEAD), filled: true });
      break;
    case "inhibits":
      heads.push({ d: barHead(b, angle, HEAD), filled: false });
      break;
    case "close": {
      const off = 2.6;
      const nx = Math.sin(angle) * off;
      const ny = -Math.cos(angle) * off;
      path = `M${round(a.x + nx)} ${round(a.y + ny)}L${round(b.x + nx)} ${round(b.y + ny)}`;
      twin = `M${round(a.x - nx)} ${round(a.y - ny)}L${round(b.x - nx)} ${round(b.y - ny)}`;
      break;
    }
    case "conflict":
      path = zigzag(a, b);
      break;
    case "cutoff":
      cut = crossBars(mid, angle);
      break;
    default:
      break;
  }

  return {
    a,
    b,
    path,
    mid,
    heads,
    dashed: edge.kind === "weak" || edge.kind === "cutoff",
    twin,
    cut,
    width,
  };
}

function arrowHead(at: { x: number; y: number }, angle: number, size: number): string {
  const spread = 0.42;
  const p1 = [at.x - Math.cos(angle - spread) * size, at.y - Math.sin(angle - spread) * size];
  const p2 = [at.x - Math.cos(angle + spread) * size, at.y - Math.sin(angle + spread) * size];
  return polygon([
    [at.x, at.y],
    [p1[0] ?? 0, p1[1] ?? 0],
    [p2[0] ?? 0, p2[1] ?? 0],
  ]);
}

/** The flat bar of an inhibiting link — the notation a systems diagram uses for "stops". */
function barHead(at: { x: number; y: number }, angle: number, size: number): string {
  const nx = Math.sin(angle) * size * 0.8;
  const ny = -Math.cos(angle) * size * 0.8;
  return `M${round(at.x + nx)} ${round(at.y + ny)}L${round(at.x - nx)} ${round(at.y - ny)}`;
}

function crossBars(mid: { x: number; y: number }, angle: number): string {
  const nx = Math.sin(angle) * 7;
  const ny = -Math.cos(angle) * 7;
  const dx = Math.cos(angle) * 4;
  const dy = Math.sin(angle) * 4;
  return [
    `M${round(mid.x - dx + nx)} ${round(mid.y - dy + ny)}L${round(mid.x - dx - nx)} ${round(mid.y - dy - ny)}`,
    `M${round(mid.x + dx + nx)} ${round(mid.y + dy + ny)}L${round(mid.x + dx - nx)} ${round(mid.y + dy - ny)}`,
  ].join("");
}

/** The saw-tooth line that means conflict in a genogram. */
function zigzag(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.max(4, Math.round(length / 12));
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const nx = Math.sin(angle) * 4;
  const ny = -Math.cos(angle) * 4;
  let d = `M${round(a.x)} ${round(a.y)}`;
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    const side = i % 2 === 0 ? 1 : -1;
    d += `L${round(a.x + (b.x - a.x) * t + nx * side)} ${round(a.y + (b.y - a.y) * t + ny * side)}`;
  }
  return `${d}L${round(b.x)} ${round(b.y)}`;
}
