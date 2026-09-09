import type { Parent, PhrasingContent, Text } from "mdast";
import { visit } from "unist-util-visit";
import type { AmlInline } from "./types";

/**
 * AML inline syntax that plain CommonMark/GFM does not know:
 *   [[Note]] [[Note#Heading]] [[Note|alias]]   wiki links
 *   ![[Note]] ![[pic.png|300]]                embeds
 *   #tag #parent/child                         tags
 *   [@key] [@a; @b, p. 4] [-@key]              Pandoc citations (kept verbatim until WP-6.5)
 * Text nodes are split into these nodes after parsing; they serialise verbatim, which also
 * keeps the escaper away from them.
 */

const WIKI = /(!?)\[\[([^\]|#]+?)(?:#([^\]|]+?))?(?:\|([^\]]+?))?\]\]/g;
// Anchored, non-global copy for single-token parsing (a shared global regex leaks lastIndex).
const WIKI_ONE = new RegExp(`^${WIKI.source}$`, "u");
const TAG = /(^|[\s(])#([\p{L}\p{N}_][\p{L}\p{N}_\-/]*)/gu;
const CITE = /\[[^\]]*?-?@[\p{L}\p{N}_:.#$%&\-+?<>~/]+[^\]]*?\]/gu;

export function parseWikiLink(raw: string): AmlInline | null {
  const m = WIKI_ONE.exec(raw);
  if (!m) return null;
  const [, bang, target = "", heading, alias] = m;
  if (bang === "!")
    return { type: "wikiEmbed", target: target.trim(), alias: alias?.trim() ?? null, raw };
  return {
    type: "wikiLink",
    target: target.trim(),
    heading: heading?.trim() ?? null,
    alias: alias?.trim() ?? null,
    raw,
  };
}

function isTagValid(name: string): boolean {
  // Purely numeric "tags" (#1, #2026) are not tags.
  return !/^\d+$/.test(name);
}

/** Splits one text value into text + AML inline nodes. Exported for unit tests. */
export function splitInline(value: string): (Text | AmlInline)[] {
  type Span = { start: number; end: number; node: AmlInline };
  const spans: Span[] = [];

  for (const m of value.matchAll(WIKI)) {
    const node = parseWikiLink(m[0]);
    if (node) spans.push({ start: m.index, end: m.index + m[0].length, node });
  }
  for (const m of value.matchAll(CITE)) {
    const start = m.index;
    const end = start + m[0].length;
    if (spans.some((s) => start < s.end && end > s.start)) continue;
    spans.push({ start, end, node: { type: "cite", raw: m[0] } });
  }
  for (const m of value.matchAll(TAG)) {
    const lead = m[1] ?? "";
    const name = m[2] ?? "";
    if (!isTagValid(name)) continue;
    const start = m.index + lead.length;
    const end = start + 1 + name.length;
    if (spans.some((s) => start < s.end && end > s.start)) continue;
    spans.push({ start, end, node: { type: "tag", name } });
  }
  if (spans.length === 0) return [{ type: "text", value }];
  spans.sort((a, b) => a.start - b.start);

  const out: (Text | AmlInline)[] = [];
  let cursor = 0;
  for (const s of spans) {
    if (s.start > cursor) out.push({ type: "text", value: value.slice(cursor, s.start) });
    out.push(s.node);
    cursor = s.end;
  }
  if (cursor < value.length) out.push({ type: "text", value: value.slice(cursor) });
  return out;
}

/** Mutates the tree: every text node (outside code/links) is split into AML inline nodes. */
export function applyInlineSyntax(tree: Parent): void {
  visit(tree, "text", (node: Text, index, parent) => {
    if (!parent || index === undefined) return;
    if (parent.type === "link" || parent.type === "linkReference") return;
    const parts = splitInline(node.value);
    if (parts.length === 1 && parts[0]?.type === "text") return;
    (parent.children as unknown[]).splice(index, 1, ...parts);
    return index + parts.length;
  });
}

export function serialiseInline(node: AmlInline): string {
  switch (node.type) {
    case "wikiLink":
    case "wikiEmbed":
    case "cite":
      return node.raw;
    case "tag":
      return `#${node.name}`;
  }
}

export type { PhrasingContent };
