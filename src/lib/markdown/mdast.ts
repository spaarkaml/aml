import type { Blockquote, Definition, Root, RootContent } from "mdast";
import { type Options as ToMarkdownOptions, toMarkdown } from "mdast-util-to-markdown";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { escapeText } from "./escape";
import { applyInlineSyntax, serialiseInline } from "./inline-syntax";
import type { AmlInline } from "./types";

/**
 * Parsing and canonical serialisation of the AML markdown dialect (ADR-003):
 * CommonMark + GFM (tables, task lists, footnotes, strikethrough, autolinks) + YAML front
 * matter + math (held verbatim) + wiki links, tags and citations.
 */

const parser = unified()
  .use(remarkParse)
  .use(remarkFrontmatter, ["yaml"])
  .use(remarkGfm, { singleTilde: false })
  .use(remarkMath);

/** Normalises bytes the way `Folio::read_note` + the editor expect: LF, no BOM. */
export function normaliseSource(text: string): string {
  let t = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  t = t.replace(/\r\n?/g, "\n");
  return t;
}

/** True when a blockquote is an Obsidian callout (`> [!type] ...`), held verbatim as Raw. */
export function isCallout(node: Blockquote): boolean {
  const first = node.children[0];
  if (!first || first.type !== "paragraph") return false;
  const t = first.children[0];
  return !!t && t.type === "text" && /^\[![\w-]+\][+-]?/.test(t.value);
}

/** Resolves reference-style links/images to inline ones and removes the definitions. */
function resolveReferences(tree: Root): void {
  const defs = new Map<string, Definition>();
  visit(tree, "definition", (d) => {
    defs.set(d.identifier.toLowerCase(), d);
  });
  if (defs.size === 0) return;
  visit(tree, (node, index, parent) => {
    if (!parent || index === undefined) return;
    if (node.type === "linkReference") {
      const d = defs.get(node.identifier.toLowerCase());
      if (!d) return;
      parent.children.splice(index, 1, {
        type: "link",
        url: d.url,
        title: d.title ?? null,
        children: node.children,
      } as RootContent);
    } else if (node.type === "imageReference") {
      const d = defs.get(node.identifier.toLowerCase());
      if (!d) return;
      parent.children.splice(index, 1, {
        type: "image",
        url: d.url,
        title: d.title ?? null,
        alt: node.alt ?? "",
      } as RootContent);
    }
  });
  tree.children = tree.children.filter((n) => n.type !== "definition");
}

export function parseMarkdown(source: string): Root {
  const tree = parser.parse(normaliseSource(source)) as Root;
  resolveReferences(tree);
  applyInlineSyntax(tree);
  return tree;
}

const amlInlineHandler = (node: AmlInline) => serialiseInline(node);

export const toMarkdownOptions: ToMarkdownOptions = {
  bullet: "-",
  bulletOther: "*",
  emphasis: "*",
  strong: "*",
  fences: true,
  fence: "`",
  rule: "-",
  listItemIndent: "one",
  incrementListMarker: true,
  setext: false,
  resourceLink: false,
  tightDefinitions: true,
  handlers: {
    // Custom AML nodes are not in mdast's Handlers map; the cast is deliberate.
    ...({
      wikiLink: amlInlineHandler,
      wikiEmbed: amlInlineHandler,
      tag: amlInlineHandler,
      cite: amlInlineHandler,
      // Raw nodes from the editor: emitted byte-for-byte (ADR-003 rule 2).
      rawMarkdown: (node: { value: string }) => node.value,
      rawInlineMarkdown: (node: { value: string }) => node.value,
    } as unknown as ToMarkdownOptions["handlers"]),
    text(node, _parent, state, info) {
      return escapeText(node.value, {
        before: info.before,
        after: info.after,
        inTable: state.stack.includes("tableCell"),
      });
    },
    link(node, _parent, state, info) {
      // GFM autolink literal: emit bare when the text is the url itself
      const only = node.children.length === 1 ? node.children[0] : undefined;
      if (only && only.type === "text" && !node.title) {
        if (only.value === node.url || `mailto:${only.value}` === node.url) return only.value;
        if (`http://${only.value}` === node.url) return only.value;
      }
      const exit = state.enter("link");
      const text = state.containerPhrasing(node, { ...info, before: "[", after: "]" });
      exit();
      const title = node.title ? ` "${node.title.replace(/"/g, '\\"')}"` : "";
      const url = /[\s()]/.test(node.url) ? `<${node.url}>` : node.url;
      return `[${text}](${url}${title})`;
    },
  },
};

const stringifier = unified()
  .use(remarkFrontmatter, ["yaml"])
  .use(remarkGfm, { singleTilde: false })
  .use(remarkMath)
  .use(remarkStringify, toMarkdownOptions);

/** Canonical markdown for a tree. Always ends with exactly one newline (empty doc → ""). */
export function serialiseMarkdown(tree: Root): string {
  const out = String(stringifier.stringify(tree));
  if (out.trim() === "") return "";
  return out.replace(/\n*$/, "\n");
}

/** Markdown for a single node (used to hold unknown content verbatim as Raw). */
export function nodeToMarkdown(node: RootContent): string {
  return toMarkdown(node, {
    ...toMarkdownOptions,
    extensions: stringifier.data("toMarkdownExtensions") as ToMarkdownOptions["extensions"],
  }).replace(/\n+$/, "");
}
