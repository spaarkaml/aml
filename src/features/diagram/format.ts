/**
 * Reading and writing a diagram as an SVG file (WP-7.1).
 *
 * The file AML writes is an ordinary SVG: it renders in Obsidian, GitHub, Quick Look, a
 * browser and a compiled PDF without AML being involved. What makes it re-editable is a
 * `<metadata>` block carrying the model — the same trick Inkscape and draw.io use — so
 * re-opening a diagram restores what the shapes *mean* rather than guessing it back out of
 * their geometry. An arrow that means "suppresses" stays "suppresses".
 *
 * The model is written one item per line so a sync conflict is legible and a diff shows what
 * moved, rather than one 40 kB line that no tool can help with.
 */

import {
  type Diagram,
  type DiagramEdge,
  type DiagramGroup,
  type DiagramNode,
  type EdgeKind,
  emptyDiagram,
  type GroupShape,
  KINDS,
  type NodeKind,
  TONE_HEX,
  TONES,
  type Tone,
} from "./model";

export const MARKER = "aml-diagram";
const VERSION = 1;

// ---------------------------------------------------------------------------- the model text

function quote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
}

function unquote(raw: string): string {
  if (!raw.startsWith('"')) return raw;
  const inner = raw.slice(1, raw.endsWith('"') ? -1 : undefined);
  let out = "";
  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i];
    if (ch === "\\" && i + 1 < inner.length) {
      const next = inner[i + 1];
      out += next === "n" ? "\n" : next;
      i += 1;
    } else if (ch !== undefined) {
      out += ch;
    }
  }
  return out;
}

/** Splits a record into `key=value` pairs, keeping quoted values whole. */
function fields(line: string): Map<string, string> {
  const out = new Map<string, string>();
  let i = 0;
  while (i < line.length) {
    while (i < line.length && line[i] === " ") i += 1;
    const eq = line.indexOf("=", i);
    if (eq === -1) break;
    const key = line.slice(i, eq);
    i = eq + 1;
    let value = "";
    if (line[i] === '"') {
      let j = i + 1;
      while (j < line.length) {
        if (line[j] === "\\") j += 2;
        else if (line[j] === '"') break;
        else j += 1;
      }
      value = line.slice(i, Math.min(j + 1, line.length));
      i = j + 1;
    } else {
      let j = i;
      while (j < line.length && line[j] !== " ") j += 1;
      value = line.slice(i, j);
      i = j;
    }
    out.set(key.trim(), unquote(value));
  }
  return out;
}

function num(f: Map<string, string>, key: string, fallback: number): number {
  const raw = f.get(key);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function tone(raw: string | undefined, fallback: Tone = "neutral"): Tone {
  return TONES.includes(raw as Tone) ? (raw as Tone) : fallback;
}

const EDGE_KINDS: EdgeKind[] = [
  "directed",
  "mutual",
  "inhibits",
  "weak",
  "flow",
  "close",
  "conflict",
  "cutoff",
  "plain",
];

/** The model, as it is written into the SVG. Deterministic: the same diagram is the same text. */
export function serialise(d: Diagram): string {
  const lines: string[] = [`${MARKER} ${VERSION}`, `size w=${d.width} h=${d.height}`];
  for (const g of d.groups) {
    lines.push(
      `group id=${g.id} shape=${g.shape} x=${g.x} y=${g.y} w=${g.w} h=${g.h} tone=${g.tone} text=${quote(g.text)}`,
    );
  }
  for (const n of d.nodes) {
    lines.push(
      `node id=${n.id} kind=${n.kind} x=${n.x} y=${n.y} w=${n.w} h=${n.h} tone=${n.tone} text=${quote(n.text)}`,
    );
  }
  for (const e of d.edges) {
    lines.push(
      `edge id=${e.id} from=${e.from} to=${e.to} kind=${e.kind} tone=${e.tone} label=${quote(e.label)}`,
    );
  }
  return lines.join("\n");
}

/**
 * The model, back out of that text.
 *
 * Deliberately forgiving: an unknown record, key, kind or tone is ignored or replaced with a
 * sensible one rather than throwing. A diagram written by a later AML should open in this one
 * as much of itself as this one understands, not as an error.
 */
export function parse(text: string): Diagram {
  const d = emptyDiagram();
  const groups: DiagramGroup[] = [];
  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith(MARKER)) continue;
    const space = line.indexOf(" ");
    if (space === -1) continue;
    const record = line.slice(0, space);
    const f = fields(line.slice(space + 1));
    if (record === "size") {
      d.width = Math.max(120, num(f, "w", d.width));
      d.height = Math.max(120, num(f, "h", d.height));
    } else if (record === "group") {
      const id = f.get("id");
      if (!id) continue;
      const shape: GroupShape = f.get("shape") === "rect" ? "rect" : "circle";
      groups.push({
        id,
        shape,
        x: num(f, "x", 0),
        y: num(f, "y", 0),
        w: Math.max(40, num(f, "w", 240)),
        h: Math.max(40, num(f, "h", 240)),
        tone: tone(f.get("tone"), "slate"),
        text: f.get("text") ?? "",
      });
    } else if (record === "node") {
      const id = f.get("id");
      if (!id) continue;
      const rawKind = f.get("kind");
      const kind: NodeKind = rawKind && rawKind in KINDS ? (rawKind as NodeKind) : "note";
      const info = KINDS[kind];
      nodes.push({
        id,
        kind,
        x: num(f, "x", 0),
        y: num(f, "y", 0),
        w: Math.max(24, num(f, "w", info.w)),
        h: Math.max(24, num(f, "h", info.h)),
        tone: tone(f.get("tone"), info.tone),
        text: f.get("text") ?? "",
      });
    } else if (record === "edge") {
      const id = f.get("id");
      const from = f.get("from");
      const to = f.get("to");
      if (!id || !from || !to) continue;
      const rawKind = f.get("kind");
      edges.push({
        id,
        from,
        to,
        kind: EDGE_KINDS.includes(rawKind as EdgeKind) ? (rawKind as EdgeKind) : "directed",
        tone: tone(f.get("tone")),
        label: f.get("label") ?? "",
      });
    }
  }
  // An edge whose ends did not survive the file is dropped rather than drawn into nowhere.
  const known = new Set(nodes.map((n) => n.id));
  d.groups = groups;
  d.nodes = nodes;
  d.edges = edges.filter((e) => known.has(e.from) && known.has(e.to));
  return d;
}

// ------------------------------------------------------------------------------- the SVG file

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function unescapeXml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * The stylesheet the exported file carries.
 *
 * Structure — text, hairlines, the page — follows the reader's light/dark setting, so a
 * diagram drawn in Paper is still legible to someone reading in Ink. The tones do not: a
 * colour you chose is part of the drawing, and swapping it for a different one in the dark
 * would be AML editing your diagram behind your back. The background rect is why this is
 * safe either way — the file brings its own paper rather than borrowing the host's.
 */
export function stylesheet(): string {
  const tones = (Object.keys(TONE_HEX) as (keyof typeof TONE_HEX)[])
    .map((name) => `.t-${name}{--c:${TONE_HEX[name]}}`)
    .join("");
  return [
    "svg{--ink:#1d1d1f;--paper:#ffffff;--line:#c9c9ce;--c:#1d1d1f;",
    'font-family:"Inter","Helvetica Neue",Helvetica,Arial,sans-serif}',
    "@media(prefers-color-scheme:dark){svg{--ink:#f0e9e7;--paper:#1f3238;--line:#3c5a63}}",
    ".t-neutral{--c:var(--ink)}",
    tones,
  ].join("");
}

/** Wraps drawn markup into a complete, standalone SVG document carrying its own model. */
export function toSvg(d: Diagram, body: string): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${d.width}" height="${d.height}"`,
    ` viewBox="0 0 ${d.width} ${d.height}" role="img">`,
    `<metadata id="${MARKER}">\n${escapeXml(serialise(d))}\n</metadata>`,
    `<style>${stylesheet()}</style>`,
    `<rect width="${d.width}" height="${d.height}" fill="var(--paper)"/>`,
    body,
    "</svg>",
  ].join("");
}

/** The model text inside an SVG AML wrote, or `null` when this is somebody else's SVG. */
export function metadataOf(svg: string): string | null {
  const open = svg.indexOf(`<metadata id="${MARKER}"`);
  if (open === -1) return null;
  const start = svg.indexOf(">", open);
  const end = svg.indexOf("</metadata>", start);
  if (start === -1 || end === -1) return null;
  return unescapeXml(svg.slice(start + 1, end)).trim();
}

export function isDiagram(svg: string): boolean {
  return metadataOf(svg) !== null;
}

/** The diagram an SVG carries, or `null` if it carries none. */
export function fromSvg(svg: string): Diagram | null {
  const text = metadataOf(svg);
  return text === null ? null : parse(text);
}

/** A file name for a diagram, from its own content where it has any. */
export function fileNameFor(d: Diagram): string {
  const first = d.nodes.find((n) => n.text.trim()) ?? d.groups.find((g) => g.text.trim());
  const slug = (first?.text ?? "diagram")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return `${slug || "diagram"}.svg`;
}
