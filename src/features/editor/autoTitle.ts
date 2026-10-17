import type { PmNode } from "@/lib/markdown";
import { baseName } from "@/lib/paths";

/**
 * Naming a new note after its own title (WP-3.12).
 *
 * A note created from the Browser or ⌘N is `Untitled.md` until it is called something. If the
 * first thing in it is a level-one heading, that is what the note is called — so writing
 * `# Thesis outline` names the file. A note the user has already named is never renamed from
 * its heading: the file name is theirs once they have typed one.
 */

/** The names `createNote` hands out: `Untitled`, `Untitled 2`, … */
const AUTO_NAME = /^Untitled(?: \d+)?$/;

/** Characters no file name may hold on macOS or Windows, plus the control range. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: the point is to strip them
const ILLEGAL = /[/\\:*?"<>|\u0000-\u001f]/g;

/** Reserved device names on Windows, which cannot be a file name even with an extension. */
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** Long enough for a real title, short enough to stay inside every path limit. */
const MAX = 80;

/** True while the note still wears the name it was created with. */
export function isAutoNamed(path: string): boolean {
  return AUTO_NAME.test(baseName(path).replace(/\.md$/i, ""));
}

/** The text of the note's own title: a level-one heading as its first block, or null. */
export function headingTitle(doc: PmNode): string | null {
  const first = (doc.content ?? []).find((n) => n.type !== "frontMatter");
  if (!first || first.type !== "heading" || first.attrs?.level !== 1) return null;
  const text = textOf(first).trim();
  return text || null;
}

function textOf(node: PmNode): string {
  if (node.type === "hardBreak") return " ";
  if (typeof node.text === "string") return node.text;
  return (node.content ?? []).map(textOf).join("");
}

/**
 * A file name for a title, or null when nothing usable is left of it. Illegal characters go,
 * runs of whitespace become one space, and the result is trimmed of the dots and spaces
 * Windows strips from the end of a name anyway.
 */
export function fileNameFor(title: string): string | null {
  const cleaned = title.replace(ILLEGAL, " ").replace(/\s+/g, " ").trim().slice(0, MAX);
  const name = cleaned
    .replace(/^\.+/, "")
    .replace(/[. ]+$/, "")
    .trim();
  if (!name || RESERVED.test(name)) return null;
  return name;
}
