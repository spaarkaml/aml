import type { PmNode } from "@/lib/markdown";

/**
 * Word count rules (Q19): exclude front matter, code blocks, HTML comments held as Raw;
 * include headings, lists, tables, quotes. Unicode-aware; CJK ideographs count one each.
 */
const WORD = /[\p{L}\p{N}]+(?:['’\-.][\p{L}\p{N}]+)*/gu;
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu;

export function countWordsInText(text: string): number {
  const cjk = text.match(CJK)?.length ?? 0;
  const rest = text.replace(CJK, " ");
  const words = rest.match(WORD)?.length ?? 0;
  return words + cjk;
}

function isComment(n: PmNode): boolean {
  const md = typeof n.attrs?.markdown === "string" ? n.attrs.markdown : "";
  return md.trimStart().startsWith("<!--");
}

export function countWords(node: PmNode): number {
  switch (node.type) {
    case "frontMatter":
    case "codeBlock":
      return 0;
    case "rawBlock":
    case "rawInline":
      return isComment(node) ? 0 : countWordsInText(String(node.attrs?.markdown ?? ""));
    case "text":
      return countWordsInText(node.text ?? "");
    case "wikiLink":
      return countWordsInText(String(node.attrs?.alias ?? node.attrs?.target ?? ""));
    case "tag":
      return 1;
    default:
      return (node.content ?? []).reduce((acc, c) => acc + countWords(c), 0);
  }
}

export function readingMinutes(words: number, wpm = 230): number {
  return Math.max(1, Math.round(words / wpm));
}
