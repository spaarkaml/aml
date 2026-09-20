import type { Parent, PhrasingContent, Text } from "mdast";
import { visit } from "unist-util-visit";
import type { Highlight, HighlightColour } from "./types";

/**
 * Highlighting, as markdown (WP-3.11).
 *
 *     ==a phrase==            yellow, the default
 *     ==a phrase=={blue}      blue, green or orange
 *
 * `==…==` is the highlight syntax the rest of the world already writes (Obsidian, Pandoc's
 * `mark`, Quarto, Discourse), so a highlighted note stays a highlighted note anywhere else;
 * the colour rides in a brace right after the closing fence, where a renderer that does not
 * know it prints four harmless characters instead of swallowing the sentence.
 *
 * Why not `<mark class="blue">`: it is valid markdown too, but it puts two whitespace-
 * separated tokens around every highlighted phrase, and AML's word counts, Goals and search
 * snippets all read the file as words (`index::extract`). A highlight must not cost you words.
 *
 * The content is ordinary markdown — `==**this**==` is bold inside a highlight — so this is a
 * pass over the parsed tree rather than a regex over the source: the fences are found among
 * the phrasing children of one parent, and everything between them is wrapped.
 */

export const HIGHLIGHT_COLOURS = ["yellow", "blue", "green", "orange"] as const;

const SUFFIX = /^\{(yellow|blue|green|orange)\}/;

/**
 * `\=\=this\=\=` is not a highlight, and by the time the tree exists the backslashes are gone —
 * a parsed text node holds the same `==` either way. So before the scan, every `=` that came
 * from an escape in the source is swapped for a NUL, which CommonMark guarantees no parsed
 * text can contain (it replaces a literal one with U+FFFD), and swapped back afterwards.
 */
const ESCAPED = "\u0000";
const PUNCT = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;

function protect(tree: Parent, source: string): void {
  visit(tree, "text", (node: Text) => {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (start === undefined || end === undefined) return;
    const raw = source.slice(start, end);
    if (!raw.includes("\\")) return;
    let out = "";
    for (let i = 0; i < raw.length; ) {
      const ch = raw[i] ?? "";
      const next = raw[i + 1] ?? "";
      if (ch === "\\" && PUNCT.test(next)) {
        out += next === "=" ? ESCAPED : next;
        i += 2;
      } else {
        out += ch;
        i += 1;
      }
    }
    // Only when the walk reproduces the node exactly: character references and anything else
    // that changes length would put the offsets out of step, and a wrong guess is worse.
    if (out.replaceAll(ESCAPED, "=") === node.value) node.value = out;
  });
}

function restore(tree: Parent): void {
  visit(tree, "text", (node: Text) => {
    if (node.value.includes(ESCAPED)) node.value = node.value.replaceAll(ESCAPED, "=");
  });
}

/** A child of some phrasing parent: mdast's own, plus the highlight we are making. */
type Child = PhrasingContent | Highlight;

/** Where a `==` fence sits: which child, and the offset of its first `=`. */
interface Fence {
  i: number;
  at: number;
}

interface Close extends Fence {
  colour: HighlightColour;
  /** `==` plus the `{colour}` suffix, if it had one. */
  len: number;
}

/**
 * The character next to a position. When the text node ends there but a sibling follows, the
 * neighbour is some other inline (a `**bold**` run, a wiki link): not whitespace, which is all
 * the flanking rules below need to know.
 */
const OTHER = "\u0001";

function charAfter(children: Child[], i: number, at: number): string {
  const n = children[i];
  if (n?.type === "text" && at < n.value.length) return n.value[at] ?? "";
  return i + 1 < children.length ? OTHER : "";
}

function charBefore(children: Child[], i: number, at: number): string {
  const n = children[i];
  if (n?.type === "text" && at > 0) return n.value[at - 1] ?? "";
  return i > 0 ? OTHER : "";
}

const blank = (ch: string) => ch === "" || /\s/.test(ch);

/** The first `==` that could open a highlight: followed by something other than space. */
function findOpen(children: Child[], from: Fence): Fence | null {
  for (let i = from.i; i < children.length; i += 1) {
    const n = children[i];
    if (n?.type !== "text") continue;
    const v = n.value;
    for (let p = i === from.i ? from.at : 0; p + 1 < v.length; p += 1) {
      if (v[p] !== "=" || v[p + 1] !== "=") continue;
      if (charBefore(children, i, p) === "=") continue;
      const after = charAfter(children, i, p + 2);
      if (blank(after) || after === "=") continue;
      return { i, at: p };
    }
  }
  return null;
}

/** The first `==` after an opener that could close it: preceded by something other than space. */
function findClose(children: Child[], from: Fence): Close | null {
  for (let i = from.i; i < children.length; i += 1) {
    const n = children[i];
    if (n?.type !== "text") continue;
    const v = n.value;
    for (let p = i === from.i ? from.at : 0; p + 1 < v.length; p += 1) {
      if (v[p] !== "=" || v[p + 1] !== "=") continue;
      const before = charBefore(children, i, p);
      if (blank(before) || before === "=") continue;
      if (charAfter(children, i, p + 2) === "=") continue;
      const m = SUFFIX.exec(v.slice(p + 2));
      const colour = (m?.[1] ?? "yellow") as HighlightColour;
      return { i, at: p, colour, len: 2 + (m ? m[0].length : 0) };
    }
  }
  return null;
}

/** The children between two positions, with the partial text nodes at each end trimmed. */
function between(children: Child[], from: Fence, to: Fence): Child[] {
  const out: Child[] = [];
  const first = children[from.i] as Text;
  if (from.i === to.i) {
    const v = first.value.slice(from.at, to.at);
    if (v) out.push({ type: "text", value: v });
    return out;
  }
  const head = first.value.slice(from.at);
  if (head) out.push({ type: "text", value: head });
  for (let i = from.i + 1; i < to.i; i += 1) {
    const child = children[i];
    if (child) out.push(child);
  }
  const last = children[to.i] as Text;
  const tail = last.value.slice(0, to.at);
  if (tail) out.push({ type: "text", value: tail });
  return out;
}

/** Wraps the first complete `==…==` in one parent's children, or returns null if there is none. */
function wrapOnce(children: Child[]): Child[] | null {
  let from: Fence = { i: 0, at: 0 };
  for (;;) {
    const open = findOpen(children, from);
    if (!open) return null;
    const close = findClose(children, { i: open.i, at: open.at + 2 });
    const inner = close ? between(children, { i: open.i, at: open.at + 2 }, close) : [];
    if (!close || inner.length === 0) {
      from = { i: open.i, at: open.at + 2 };
      continue;
    }
    const out: Child[] = children.slice(0, open.i);
    const before = (children[open.i] as Text).value.slice(0, open.at);
    if (before) out.push({ type: "text", value: before });
    out.push({ type: "highlight", colour: close.colour, children: inner } as Highlight);
    const after = (children[close.i] as Text).value.slice(close.at + close.len);
    if (after) out.push({ type: "text", value: after });
    out.push(...children.slice(close.i + 1));
    return out;
  }
}

/** Mutates the tree: `==…==` among any parent's phrasing children becomes a highlight node. */
export function wrapHighlights(tree: Parent, source = ""): void {
  const escapes = source.includes("\\=");
  if (escapes) protect(tree, source);
  visit(tree, (node) => {
    const parent = node as Parent;
    if (!Array.isArray(parent.children)) return;
    let children = parent.children as Child[];
    for (let next = wrapOnce(children); next; next = wrapOnce(children)) children = next;
    parent.children = children as Parent["children"];
  });
  if (escapes) restore(tree);
}

/** The fences for a colour: yellow is the bare `==…==`, the rest name themselves. */
export function highlightFences(colour: HighlightColour): [string, string] {
  return ["==", colour === "yellow" ? "==" : `=={${colour}}`];
}
