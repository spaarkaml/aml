import { normaliseSource, parseMarkdown, serialiseMarkdown } from "./mdast";
import { mdastToPm, pmToMdast } from "./pm";
import type { PmDoc, PmNode } from "./types";

/** Markdown source → ProseMirror document JSON. */
export function markdownToDoc(source: string): PmDoc {
  const normalised = normaliseSource(source);
  return mdastToPm(parseMarkdown(normalised), normalised);
}

/** ProseMirror document JSON → canonical markdown. */
export function docToMarkdown(doc: PmNode): string {
  return serialiseMarkdown(pmToMdast(doc));
}

export type { PmDoc, PmNode };
/**
 * Canonical AML markdown = what the editor writes: source → document → markdown.
 * Used by the Obsidian importer (WP-2.10) and the fidelity tests.
 */
export function canonicalise(source: string): string {
  return docToMarkdown(markdownToDoc(source));
}

export { normaliseSource, parseMarkdown, serialiseMarkdown };
