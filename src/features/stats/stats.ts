import { sentenceEnds } from "@/features/writing/sentences";
import type { PmNode } from "@/lib/markdown";
import { countWords, readingMinutes } from "@/lib/wordcount";

/**
 * Statistics for the open note (WP-3.7).
 *
 * Everything here counts the same text the status bar counts — Q19's rules, from
 * `lib/wordcount.ts`: front matter, code blocks and HTML comments are not prose, headings
 * and tables are. Two places disagreeing about what a word is would be worse than either
 * being wrong.
 */

export interface Readability {
  /** Flesch reading ease, 0–100. Higher is plainer. */
  ease: number;
  /** Flesch–Kincaid grade level: US school years. */
  grade: number;
  label: string;
}

export interface Stats {
  words: number;
  characters: number;
  charactersNoSpaces: number;
  sentences: number;
  paragraphs: number;
  minutes: number;
  /** Null when there is too little text for the arithmetic to mean anything. */
  readability: Readability | null;
}

export interface Section {
  level: number;
  /** Display depth with skipped levels collapsed, as the Outline does it. */
  depth: number;
  text: string;
  /** Words in this heading's section, its subsections included. */
  words: number;
}

/** A comment held as Raw is not prose; the same test `countWords` uses. */
function isComment(n: PmNode): boolean {
  const md = typeof n.attrs?.markdown === "string" ? n.attrs.markdown : "";
  return md.trimStart().startsWith("<!--");
}

/**
 * The prose of a node as one string, with a blank line between blocks so sentences cannot
 * run from one paragraph into the next.
 */
export function proseText(node: PmNode): string {
  switch (node.type) {
    case "frontMatter":
    case "codeBlock":
      return "";
    case "rawBlock":
    case "rawInline":
      return isComment(node) ? "" : String(node.attrs?.markdown ?? "");
    case "text":
      return node.text ?? "";
    case "wikiLink":
      return String(node.attrs?.alias ?? node.attrs?.target ?? "");
    case "tag":
      return `#${String(node.attrs?.name ?? "")}`;
    default: {
      const inner = (node.content ?? []).map(proseText).filter(Boolean);
      const block = node.type === "doc" || BLOCKS.has(node.type);
      return inner.join(block ? "\n\n" : "");
    }
  }
}

/** Node types whose children are separate blocks of prose rather than one run of text. */
const BLOCKS = new Set([
  "blockquote",
  "bulletList",
  "orderedList",
  "taskList",
  "listItem",
  "taskItem",
  "table",
  "tableRow",
  "footnoteDef",
  "callout",
]);

function countParagraphs(node: PmNode): number {
  if (node.type === "frontMatter" || node.type === "codeBlock") return 0;
  if (node.type === "paragraph") return proseText(node).trim() ? 1 : 0;
  return (node.content ?? []).reduce((acc, c) => acc + countParagraphs(c), 0);
}

/** Vowel-group heuristic — the usual one. Good enough for a grade level, never exact. */
export function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const trimmed = w.replace(/(?:[^laeiouy]es|[^laeiouy]e|ed)$/, "").replace(/^y/, "");
  return trimmed.match(/[aeiouy]{1,2}/g)?.length || 1;
}

const BANDS: Array<[number, string]> = [
  [90, "Very easy"],
  [80, "Easy"],
  [70, "Fairly easy"],
  [60, "Plain English"],
  [50, "Fairly difficult"],
  [30, "Difficult"],
  [0, "Very difficult"],
];

/**
 * Flesch reading ease and Flesch–Kincaid grade. Both need a sentence count and a syllable
 * count, so both are estimates; below twenty words they are noise, and saying nothing is
 * more honest than printing a grade level for a sentence and a half.
 */
export function readabilityOf(text: string, words: number, sentences: number): Readability | null {
  if (words < 20 || sentences < 1) return null;
  const syllableCount = (text.match(/[\p{L}\p{N}]+/gu) ?? []).reduce(
    (acc, w) => acc + syllables(w),
    0,
  );
  const perSentence = words / sentences;
  const perWord = syllableCount / words;
  const ease = 206.835 - 1.015 * perSentence - 84.6 * perWord;
  const grade = 0.39 * perSentence + 11.8 * perWord - 15.59;
  const label = BANDS.find(([floor]) => ease >= floor)?.[1] ?? "Very difficult";
  return {
    ease: Math.round(Math.max(0, Math.min(100, ease)) * 10) / 10,
    grade: Math.round(Math.max(0, grade) * 10) / 10,
    label,
  };
}

export function statsOf(doc: PmNode | null): Stats {
  const empty: Stats = {
    words: 0,
    characters: 0,
    charactersNoSpaces: 0,
    sentences: 0,
    paragraphs: 0,
    minutes: 0,
    readability: null,
  };
  if (!doc) return empty;
  const text = proseText(doc).trim();
  if (!text) return empty;
  const words = countWords(doc);
  // One count per block, so a full stop at the end of a paragraph is not counted twice and a
  // paragraph without one still counts as a sentence.
  const sentences = text
    .split(/\n{2,}/)
    .filter((block) => block.trim())
    .reduce((acc, block) => acc + Math.max(1, sentenceEnds(block.trim()).length), 0);
  return {
    words,
    characters: text.length,
    charactersNoSpaces: text.replace(/\s/g, "").length,
    sentences,
    paragraphs: countParagraphs(doc),
    minutes: readingMinutes(words),
    readability: readabilityOf(text, words, sentences),
  };
}

/**
 * Words under each heading, its subsections included — the number that answers "how long is
 * chapter three". Content before the first heading is reported under an empty heading, and
 * only when there is some.
 */
export function sectionsOf(doc: PmNode | null): Section[] {
  const top = doc?.content ?? [];
  const headings: Array<{ level: number; text: string; at: number }> = [];
  top.forEach((node, at) => {
    if (node.type !== "heading") return;
    const level = Math.min(6, Math.max(1, Number(node.attrs?.level) || 1));
    headings.push({ level, text: proseText(node).trim(), at });
  });

  const wordsBetween = (from: number, to: number) =>
    top.slice(from, to).reduce((acc, n) => acc + countWords(n), 0);

  const out: Section[] = [];
  const first = headings[0]?.at ?? top.length;
  const preamble = wordsBetween(0, first);
  if (preamble > 0) out.push({ level: 0, depth: 0, text: "", words: preamble });

  const stack: number[] = [];
  headings.forEach((h, i) => {
    const nextSame = headings.findIndex((o, j) => j > i && o.level <= h.level);
    const end = nextSame === -1 ? top.length : (headings[nextSame]?.at ?? top.length);
    while (stack.length > 0 && (stack[stack.length - 1] ?? 0) >= h.level) stack.pop();
    stack.push(h.level);
    out.push({
      level: h.level,
      depth: stack.length - 1,
      text: h.text,
      words: wordsBetween(h.at, end),
    });
  });
  return out;
}

/** A word count the way every figure in this panel is shown. */
export function figure(value: number): string {
  return value.toLocaleString("en-AU");
}
