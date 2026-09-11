import type {
  BlockContent,
  Blockquote,
  DefinitionContent,
  List,
  ListItem,
  PhrasingContent,
  Root,
  RootContent,
  Table,
  TableRow,
} from "mdast";
import { calloutToSource, parseCalloutSource } from "./callout";
import {
  isCallout,
  nodeToMarkdown,
  normaliseSource,
  parseMarkdown,
  serialiseMarkdown,
} from "./mdast";
import type { AmlInline, PmDoc, PmMark, PmNode } from "./types";

/**
 * mdast ⇄ ProseMirror JSON. Node names match the Tiptap extensions in
 * `src/features/editor/extensions`. Anything without a model becomes `rawBlock` / `rawInline`
 * holding the exact markdown, which serialises back verbatim (ADR-003 rule 2).
 */

type Block = BlockContent | DefinitionContent;
type Inline = PhrasingContent | AmlInline;

// ---------- mdast → PM ----------

/** `source` is the normalised markdown the tree was parsed from; Raw nodes slice it verbatim. */
export function mdastToPm(tree: Root, source = ""): PmDoc {
  const ctx: Ctx = { source };
  const content: PmNode[] = [];
  for (const child of tree.children) content.push(blockToPm(child, ctx));
  if (content.length === 0) content.push({ type: "paragraph" });
  return { type: "doc", content };
}

interface Ctx {
  source: string;
}

/** Exact source text of a node when positions are available, else a re-serialisation. */
function verbatim(node: RootContent | Inline, ctx: Ctx): string {
  const pos = (node as { position?: { start: { offset?: number }; end: { offset?: number } } })
    .position;
  const start = pos?.start.offset;
  const end = pos?.end.offset;
  if (ctx.source && typeof start === "number" && typeof end === "number") {
    return ctx.source.slice(start, end);
  }
  return nodeToMarkdown(node as RootContent);
}

function raw(markdown: string): PmNode {
  return { type: "rawBlock", attrs: { markdown } };
}

function blockToPm(node: RootContent, ctx: Ctx): PmNode {
  switch (node.type) {
    case "yaml":
      return { type: "frontMatter", attrs: { yaml: node.value } };
    case "paragraph":
      return { type: "paragraph", content: inlinesToPm(node.children as Inline[], ctx) };
    case "heading":
      return {
        type: "heading",
        attrs: { level: node.depth },
        content: inlinesToPm(node.children as Inline[], ctx),
      };
    case "thematicBreak":
      return { type: "horizontalRule" };
    case "blockquote": {
      // A callout is read from its own source text, not from its mdast children: mdast puts
      // the title line and the first body line in one paragraph joined by a soft break, and
      // separating them again is both harder and less exact than reading the lines (WP-3.9).
      const callout = isCallout(node) ? parseCalloutSource(verbatim(node, ctx)) : null;
      if (callout) return calloutToPm(callout);
      return { type: "blockquote", content: blocksToPm(node.children, ctx) };
    }
    case "list":
      return listToPm(node, ctx);
    case "code":
      return {
        type: "codeBlock",
        attrs: { language: node.lang ?? null, meta: node.meta ?? null },
        content: node.value ? [{ type: "text", text: node.value }] : [],
      };
    case "html":
      return raw(node.value);
    case "math":
      return raw(verbatim(node, ctx));
    case "table":
      return tableToPm(node, ctx);
    case "footnoteDefinition":
      return {
        type: "footnoteDef",
        attrs: { id: node.identifier, label: node.label ?? node.identifier },
        content: blocksToPm(node.children, ctx),
      };
    default:
      return raw(verbatim(node, ctx));
  }
}

/**
 * A callout as a node with a real title and real block content. The title and body are
 * markdown in their own right, so both are parsed as such — which is what makes an emphasised
 * title survive, and a nested callout inside the body become a nested callout node.
 */
function calloutToPm(callout: ReturnType<typeof parseCalloutSource> & object): PmNode {
  const titleTree = callout.title ? parseMarkdown(callout.title) : null;
  const firstBlock = titleTree?.children[0];
  const titleInlines =
    firstBlock?.type === "paragraph"
      ? inlinesToPm(firstBlock.children as Inline[], { source: callout.title })
      : [];
  const body = callout.body.trim()
    ? mdastToPm(parseMarkdown(callout.body), normaliseSource(callout.body)).content
    : [{ type: "paragraph" }];
  return {
    type: "callout",
    attrs: { kind: callout.kind, fold: callout.fold },
    content: [{ type: "calloutTitle", content: titleInlines }, ...body],
  };
}

function blocksToPm(children: (Block | RootContent)[], ctx: Ctx): PmNode[] {
  const out = children.map((c) => blockToPm(c as RootContent, ctx));
  return out.length ? out : [{ type: "paragraph" }];
}

function listToPm(node: List, ctx: Ctx): PmNode {
  const checks = node.children.map((li) => li.checked ?? null);
  const allTasks = checks.length > 0 && checks.every((c) => c !== null);
  const someTasks = checks.some((c) => c !== null);
  if (someTasks && !allTasks) return raw(verbatim(node, ctx));
  const spread = node.spread || node.children.some((li) => li.spread);
  const items = node.children.map((li) => listItemToPm(li, allTasks, ctx));
  if (allTasks) return { type: "taskList", attrs: { spread }, content: items };
  if (node.ordered)
    return { type: "orderedList", attrs: { start: node.start ?? 1, spread }, content: items };
  return { type: "bulletList", attrs: { spread }, content: items };
}

function listItemToPm(li: ListItem, task: boolean, ctx: Ctx): PmNode {
  const content = blocksToPm(li.children, ctx);
  if (task) return { type: "taskItem", attrs: { checked: li.checked === true }, content };
  return { type: "listItem", content };
}

function tableToPm(node: Table, ctx: Ctx): PmNode {
  const rows = node.children.map((row, r) => tableRowToPm(row, r === 0, ctx));
  return { type: "table", attrs: { align: node.align ?? [] }, content: rows };
}

function tableRowToPm(row: TableRow, header: boolean, ctx: Ctx): PmNode {
  return {
    type: "tableRow",
    content: row.children.map((cell) => ({
      type: header ? "tableHeader" : "tableCell",
      attrs: { colspan: 1, rowspan: 1, colwidth: null },
      content: [{ type: "paragraph", content: inlinesToPm(cell.children as Inline[], ctx) }],
    })),
  };
}

function inlinesToPm(nodes: Inline[], ctx: Ctx, marks: PmMark[] = []): PmNode[] {
  const out: PmNode[] = [];
  for (const n of nodes) out.push(...inlineToPm(n, ctx, marks));
  return out;
}

function withMark(marks: PmMark[], mark: PmMark): PmMark[] {
  return [...marks.filter((m) => m.type !== mark.type), mark];
}

function textNode(text: string, marks: PmMark[]): PmNode[] {
  if (text === "") return [];
  return [marks.length ? { type: "text", text, marks } : { type: "text", text }];
}

function inlineToPm(node: Inline, ctx: Ctx, marks: PmMark[]): PmNode[] {
  switch (node.type) {
    case "text":
      return textNode(node.value, marks);
    case "emphasis":
      return inlinesToPm(node.children as Inline[], ctx, withMark(marks, { type: "italic" }));
    case "strong":
      return inlinesToPm(node.children as Inline[], ctx, withMark(marks, { type: "bold" }));
    case "delete":
      return inlinesToPm(node.children as Inline[], ctx, withMark(marks, { type: "strike" }));
    case "inlineCode":
      return textNode(node.value, withMark(marks, { type: "code" }));
    case "link":
      return inlinesToPm(
        node.children as Inline[],
        ctx,
        withMark(marks, { type: "link", attrs: { href: node.url, title: node.title ?? null } }),
      );
    case "image":
      return [
        {
          type: "image",
          attrs: { src: node.url, alt: node.alt ?? "", title: node.title ?? null },
          marks,
        },
      ];
    case "break":
      return [{ type: "hardBreak", marks }];
    case "html":
      return [{ type: "rawInline", attrs: { markdown: node.value }, marks }];
    case "inlineMath":
      return [
        { type: "rawInline", attrs: { markdown: nodeToMarkdown(node as RootContent) }, marks },
      ];
    case "footnoteReference":
      return [
        {
          type: "footnoteRef",
          attrs: { id: node.identifier, label: node.label ?? node.identifier },
          marks,
        },
      ];
    case "wikiLink":
      return [
        {
          type: "wikiLink",
          attrs: { target: node.target, heading: node.heading, alias: node.alias, raw: node.raw },
          marks,
        },
      ];
    case "wikiEmbed":
      return [
        {
          type: "wikiEmbed",
          attrs: { target: node.target, alias: node.alias, raw: node.raw },
          marks,
        },
      ];
    case "tag":
      return [{ type: "tag", attrs: { name: node.name }, marks }];
    case "cite":
      return [{ type: "cite", attrs: { raw: node.raw }, marks }];
    default:
      return [
        { type: "rawInline", attrs: { markdown: nodeToMarkdown(node as RootContent) }, marks },
      ];
  }
}

// ---------- PM → mdast ----------

export function pmToMdast(doc: PmNode): Root {
  const children: RootContent[] = [];
  for (const n of doc.content ?? []) children.push(...pmBlockToMdast(n));
  return { type: "root", children };
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

/** Raw blocks go back out byte-for-byte via the `rawMarkdown` handler in mdast.ts. */
function rawToMdast(markdown: string): RootContent[] {
  if (markdown === "") return [];
  return [{ type: "rawMarkdown", value: markdown } as unknown as RootContent];
}

function pmBlockToMdast(n: PmNode): RootContent[] {
  const a = n.attrs ?? {};
  switch (n.type) {
    case "frontMatter":
      return [{ type: "yaml", value: str(a.yaml) }];
    case "paragraph": {
      const children = pmInlinesToMdast(n.content ?? []);
      return [{ type: "paragraph", children }];
    }
    case "heading":
      return [
        {
          type: "heading",
          depth: clampDepth(a.level),
          children: pmInlinesToMdast(n.content ?? []),
        },
      ];
    case "horizontalRule":
      return [{ type: "thematicBreak" }];
    case "blockquote": {
      const bq: Blockquote = {
        type: "blockquote",
        children: pmBlocksToMdast(n.content ?? []) as Blockquote["children"],
      };
      return [bq];
    }
    case "bulletList":
    case "orderedList":
    case "taskList":
      return [pmListToMdast(n)];
    case "codeBlock": {
      const value = (n.content ?? []).map((t) => t.text ?? "").join("");
      const lang = str(a.language) || null;
      const meta = str(a.meta) || null;
      return [{ type: "code", lang, meta, value }];
    }
    case "rawBlock":
      return rawToMdast(str(a.markdown));
    case "callout": {
      // Emitted as Raw so the exact line shape is ours: the body has to sit on the lines
      // straight after the head, and a stringifier would put a blank `>` line between them.
      const [title, ...body] = n.content ?? [];
      const titleMd = title?.type === "calloutTitle" ? inlineRunToMarkdown(title) : "";
      const blocks = pmBlocksToMdast(title?.type === "calloutTitle" ? body : (n.content ?? []));
      const bodyMd = serialiseMarkdown({ type: "root", children: blocks }).replace(/\n+$/, "");
      const fold = a.fold === "+" || a.fold === "-" ? a.fold : null;
      return rawToMdast(
        calloutToSource({
          kind: str(a.kind, "note") || "note",
          fold,
          title: titleMd,
          body: bodyMd,
        }),
      );
    }
    case "table":
      return [pmTableToMdast(n)];
    case "footnoteDef":
      return [
        {
          type: "footnoteDefinition",
          identifier: str(a.id),
          label: str(a.label, str(a.id)),
          children: pmBlocksToMdast(n.content ?? []) as DefinitionContent[] as never,
        },
      ];
    default: {
      // Unknown PM node: flatten its text so nothing is lost silently.
      const text = collectText(n);
      return text ? [{ type: "paragraph", children: [{ type: "text", value: text }] }] : [];
    }
  }
}

function clampDepth(v: unknown): 1 | 2 | 3 | 4 | 5 | 6 {
  const n = typeof v === "number" ? v : 1;
  return Math.min(6, Math.max(1, Math.round(n))) as 1 | 2 | 3 | 4 | 5 | 6;
}

function collectText(n: PmNode): string {
  if (n.text) return n.text;
  return (n.content ?? []).map(collectText).join("");
}

/** A run of inline nodes as one line of markdown — the callout's title. */
function inlineRunToMarkdown(node: PmNode): string {
  const children = pmInlinesToMdast(node.content ?? []);
  if (children.length === 0) return "";
  return serialiseMarkdown({ type: "root", children: [{ type: "paragraph", children }] })
    .replace(/\n+$/, "")
    .replace(/\n/g, " ");
}

function pmBlocksToMdast(nodes: PmNode[]): RootContent[] {
  const out: RootContent[] = [];
  for (const n of nodes) out.push(...pmBlockToMdast(n));
  return out;
}

function pmListToMdast(n: PmNode): List {
  const a = n.attrs ?? {};
  const spread = a.spread === true;
  const ordered = n.type === "orderedList";
  const items: ListItem[] = (n.content ?? []).map((li) => {
    const checked = n.type === "taskList" ? li.attrs?.checked === true : null;
    const children = pmBlocksToMdast(li.content ?? []);
    return { type: "listItem", spread, checked, children: children as ListItem["children"] };
  });
  return {
    type: "list",
    ordered,
    start: ordered ? (typeof a.start === "number" ? a.start : 1) : null,
    spread,
    children: items,
  };
}

function pmTableToMdast(n: PmNode): Table {
  const a = n.attrs ?? {};
  const align = Array.isArray(a.align) ? (a.align as Table["align"]) : [];
  const rows: TableRow[] = (n.content ?? []).map((row) => ({
    type: "tableRow",
    children: (row.content ?? []).map((cell) => ({
      type: "tableCell",
      children: pmInlinesToMdast(cellInlines(cell)),
    })),
  }));
  return { type: "table", align, children: rows };
}

/** A PM table cell holds block content; markdown cells are single-line phrasing. Join with a space. */
function cellInlines(cell: PmNode): PmNode[] {
  const blocks = cell.content ?? [];
  const out: PmNode[] = [];
  blocks.forEach((b, i) => {
    if (i > 0) out.push({ type: "text", text: " " });
    out.push(...(b.content ?? []));
  });
  return out;
}

const MARK_TYPES = ["link", "bold", "italic", "strike"] as const;
type MarkType = (typeof MARK_TYPES)[number];

function hasMark(n: PmNode, type: string): PmMark | undefined {
  return n.marks?.find((m) => m.type === type);
}

function sameMark(a: PmMark | undefined, b: PmMark | undefined): boolean {
  if (!a || !b) return false;
  return JSON.stringify(a.attrs ?? {}) === JSON.stringify(b.attrs ?? {});
}

function runLength(nodes: PmNode[], i: number, type: string, mark: PmMark): number {
  let j = i + 1;
  while (j < nodes.length && sameMark(hasMark(nodes[j] as PmNode, type), mark)) j += 1;
  return j;
}

/**
 * Markdown cannot express `*a **b*** c` style overlaps, and `* text*` is not emphasis.
 * So: (1) at each position wrap the mark whose contiguous run is longest (ties by MARK_TYPES
 * order), recursing inside; (2) leading/trailing whitespace of a wrapped run is moved outside.
 */
function pmInlinesToMdast(
  nodes: PmNode[],
  exclude: ReadonlySet<string> = new Set(),
): PhrasingContent[] {
  const out: PhrasingContent[] = [];
  let i = 0;
  while (i < nodes.length) {
    const node = nodes[i] as PmNode;
    let best: { type: MarkType; mark: PmMark; end: number } | null = null;
    for (const type of MARK_TYPES) {
      if (exclude.has(type)) continue;
      const mark = hasMark(node, type);
      if (!mark) continue;
      const end = runLength(nodes, i, type, mark);
      if (!best || end > best.end) best = { type, mark, end };
    }
    if (!best) {
      out.push(...pmLeafToMdast(node));
      i += 1;
      continue;
    }
    const run = nodes.slice(i, best.end);
    const { lead, trail, inner } = expelWhitespace(run);
    if (lead) out.push({ type: "text", value: lead });
    if (inner.length > 0) {
      const next = new Set(exclude);
      next.add(best.type);
      out.push(wrapMark(best.type, best.mark, pmInlinesToMdast(inner, next)));
    }
    if (trail) out.push({ type: "text", value: trail });
    i = best.end;
  }
  return mergeAdjacentText(out);
}

function expelWhitespace(run: PmNode[]): { lead: string; trail: string; inner: PmNode[] } {
  const inner = run.map((n) => ({ ...n }));
  let lead = "";
  let trail = "";
  const first = inner[0];
  if (first?.type === "text" && first.text) {
    const m = /^\s+/.exec(first.text);
    if (m) {
      lead = m[0];
      first.text = first.text.slice(m[0].length);
    }
  }
  const last = inner[inner.length - 1];
  if (last?.type === "text" && last.text) {
    const m = /\s+$/.exec(last.text);
    if (m) {
      trail = m[0];
      last.text = last.text.slice(0, -m[0].length);
    }
  }
  return { lead, trail, inner: inner.filter((n) => !(n.type === "text" && n.text === "")) };
}

function mergeAdjacentText(nodes: PhrasingContent[]): PhrasingContent[] {
  const out: PhrasingContent[] = [];
  for (const n of nodes) {
    const prev = out[out.length - 1];
    if (n.type === "text" && prev?.type === "text") prev.value += n.value;
    else out.push(n);
  }
  return out;
}

function wrapMark(type: string, mark: PmMark, children: PhrasingContent[]): PhrasingContent {
  switch (type) {
    case "link":
      return {
        type: "link",
        url: str(mark.attrs?.href),
        title: str(mark.attrs?.title) || null,
        children,
      };
    case "bold":
      return { type: "strong", children };
    case "italic":
      return { type: "emphasis", children };
    default:
      return { type: "delete", children };
  }
}

function pmLeafToMdast(n: PmNode): PhrasingContent[] {
  const a = n.attrs ?? {};
  switch (n.type) {
    case "text":
      if (hasMark(n, "code")) return [{ type: "inlineCode", value: n.text ?? "" }];
      return n.text ? [{ type: "text", value: n.text }] : [];
    case "hardBreak":
      return [{ type: "break" }];
    case "image":
      return [{ type: "image", url: str(a.src), alt: str(a.alt), title: str(a.title) || null }];
    case "rawInline":
      return rawInlineToMdast(str(a.markdown));
    case "footnoteRef":
      return [{ type: "footnoteReference", identifier: str(a.id), label: str(a.label, str(a.id)) }];
    case "wikiLink":
      return [
        {
          type: "wikiLink",
          target: str(a.target),
          heading: (a.heading as string | null) ?? null,
          alias: (a.alias as string | null) ?? null,
          raw: str(a.raw),
        } as never,
      ];
    case "wikiEmbed":
      return [
        {
          type: "wikiEmbed",
          target: str(a.target),
          alias: (a.alias as string | null) ?? null,
          raw: str(a.raw),
        } as never,
      ];
    case "tag":
      return [{ type: "tag", name: str(a.name) } as never];
    case "cite":
      return [{ type: "cite", raw: str(a.raw) } as never];
    default: {
      const text = collectText(n);
      return text ? [{ type: "text", value: text }] : [];
    }
  }
}

function rawInlineToMdast(markdown: string): PhrasingContent[] {
  if (markdown === "") return [];
  return [{ type: "rawInlineMarkdown", value: markdown } as unknown as PhrasingContent];
}
