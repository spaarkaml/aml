import type { Nodes as MdastNodes, PhrasingContent, Root } from "mdast";

/** ProseMirror JSON (what Tiptap's `editor.getJSON()` returns and `setContent` accepts). */
export interface PmMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface PmNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PmNode[];
  marks?: PmMark[];
  text?: string;
}

export type PmDoc = PmNode & { type: "doc"; content: PmNode[] };

/* Custom mdast node types added by the AML dialect (see inline-syntax.ts). */
export interface WikiLink {
  type: "wikiLink";
  target: string;
  heading: string | null;
  alias: string | null;
  /** The original source, emitted verbatim. */
  raw: string;
}
export interface WikiEmbed {
  type: "wikiEmbed";
  target: string;
  alias: string | null;
  raw: string;
}
export interface Tag {
  type: "tag";
  name: string;
}
export interface Cite {
  type: "cite";
  raw: string;
}

/**
 * A highlight (WP-3.11). Unlike the inlines above it has children of its own — what is
 * highlighted is ordinary markdown — so it is a Parent, not a verbatim run.
 */
export type HighlightColour = "yellow" | "blue" | "green" | "orange";
export interface Highlight {
  type: "highlight";
  colour: HighlightColour;
  children: PhrasingContent[];
}

export type AmlInline = WikiLink | WikiEmbed | Tag | Cite;
export type AnyMdast = MdastNodes | AmlInline | Highlight;
export type { Root };
