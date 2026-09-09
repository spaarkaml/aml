import type { Node as PmNode } from "@tiptap/pm/model";

export interface WordSpan {
  word: string;
  from: number;
  to: number;
}

/** Block node types whose text is never checked (ADR-009 ignore rules). */
const SKIP_BLOCKS = new Set(["codeBlock", "frontMatter", "rawBlock"]);
/** Marks whose text is never checked: code, and links (URLs, file names). */
const SKIP_MARKS = new Set(["code", "link"]);

const WORD = /[\p{L}\p{M}][\p{L}\p{M}'’]*/gu;

/** True for words the checker should not judge: acronyms, single letters, mixed scripts. */
export function skipWord(word: string): boolean {
  if (word.length < 2) return true;
  if (/^[\p{Lu}]+$/u.test(word)) return true; // acronyms: AML, NAS, ANU
  if (/^[\p{Lu}]+[\p{Ll}]+[\p{Lu}]/u.test(word)) return true; // CamelCase identifiers
  return false;
}

/** Strips a possessive so `Bryce's` checks as `Bryce`. */
export function normalise(word: string): string {
  return word.replace(/['’]s$/u, "").replace(/^['’]+|['’]+$/gu, "");
}

/**
 * Walks the document and yields every checkable word with its absolute position range.
 * Text inside skipped blocks, code/link marks and atoms (wiki links, tags, citations are
 * atoms with no text) is never yielded.
 */
export function collectWords(doc: PmNode): WordSpan[] {
  const out: WordSpan[] = [];
  doc.descendants((node, pos) => {
    if (SKIP_BLOCKS.has(node.type.name)) return false;
    if (!node.isText || !node.text) return true;
    if (node.marks.some((m) => SKIP_MARKS.has(m.type.name))) return false;
    for (const m of node.text.matchAll(WORD)) {
      const raw = m[0];
      const word = normalise(raw);
      if (!word || skipWord(word)) continue;
      const start = pos + m.index + raw.indexOf(word);
      out.push({ word, from: start, to: start + word.length });
    }
    return false;
  });
  return out;
}
