import { markdownToDoc, type PmDoc, type PmNode } from "@/lib/markdown";
import { getActiveEditor } from "./editorRef";

/**
 * Reformat a note from the markdown it already contains (WP-3.12).
 *
 * Markdown pasted as plain text lands in the editor as paragraphs: `## Heading` is a
 * paragraph that happens to start with two hashes, and a pasted list is one paragraph with
 * hard breaks in it (ProseMirror's own plain-text paste splits blocks on blank lines and
 * lines on `<br>`). This pass puts that text back through the parser, in place, so it becomes
 * the headings, lists and marks it describes.
 *
 * It is deliberately conservative: only runs of paragraphs holding nothing but unmarked text
 * and hard breaks are considered, so anything already formatted — a real heading, a table, an
 * image, a word in bold — is passed through untouched. A run is reparsed only if it looks like
 * markdown at all and the parse actually comes out different.
 */

/** Any one of these in a run is enough to treat it as markdown source. */
const MARKERS: RegExp[] = [
  /^ {0,3}#{1,6} \S/m, // heading
  /^ {0,3}[-*+] \S/m, // bullet or task list
  /^ {0,3}\d{1,9}[.)] \S/m, // ordered list
  /^ {0,3}> /m, // block quote
  /^ {0,3}(?:```|~~~)/m, // fence
  /^ {0,3}(?:-{3,}|\*{3,}|_{3,})[ \t]*$/m, // thematic break
  /^ {0,3}\|.*\|[ \t]*$/m, // table row
  /\*\*\S[\s\S]*?\*\*/, // bold
  /\[[^\]]+\]\([^)]+\)/, // link
  /`[^`\n]+`/, // code span
  /==\S[\s\S]*?==/, // highlight
];

/**
 * The source text of a paragraph, or null when it holds anything but unmarked text — a mark,
 * an image, a wiki link — which means it is already formatted and not source at all.
 */
function sourceOf(node: PmNode): string | null {
  if (node.type !== "paragraph") return null;
  const parts: string[] = [];
  for (const child of node.content ?? []) {
    if (child.marks?.length) return null;
    if (child.type === "hardBreak") parts.push("\n");
    else if (child.type === "text") parts.push(child.text ?? "");
    else return null;
  }
  return parts.join("");
}

/**
 * Which kind of block a line opens, for deciding how two paragraphs of a run go back together.
 * Pasting splits a list into one paragraph per item, and joining those with a blank line would
 * make the list loose — a different thing on the page and in the file.
 */
const BULLET = /^ {0,3}[-*+] /;
const ORDERED = /^ {0,3}\d{1,9}[.)] /;
const QUOTE = /^ {0,3}>/;

function family(line: string): string | null {
  if (BULLET.test(line)) return "bullet";
  if (ORDERED.test(line)) return "ordered";
  if (QUOTE.test(line)) return "quote";
  return null;
}

/** Paragraphs back into source: a blank line between them, unless they continue one block. */
function joinSources(sources: string[]): string {
  let out = sources[0] ?? "";
  for (const next of sources.slice(1)) {
    const previous = out.slice(out.lastIndexOf("\n") + 1);
    const opener = family(previous);
    out +=
      opener && opener === family(next.slice(0, next.indexOf("\n") + 1 || undefined))
        ? "\n"
        : "\n\n";
    out += next;
  }
  return out;
}

function isEmptyParagraph(node: PmNode): boolean {
  return node.type === "paragraph" && (node.content?.length ?? 0) === 0;
}

/**
 * Reparses one run of paragraphs. A run that does not start the document is parsed with a
 * blank line in front of it, because front matter is a property of the top of a file: `---`
 * anywhere else is a thematic break and must not become a YAML block.
 */
function reparse(text: string, atStart: boolean): PmNode[] | null {
  if (!text.trim()) return null;
  if (!MARKERS.some((re) => re.test(text))) return null;
  const parsed = markdownToDoc(atStart ? text : `\n${text}`).content;
  return parsed.length ? parsed : null;
}

/**
 * The document with every markdown-looking paragraph run reparsed, or null when nothing in it
 * needed reformatting (so the caller can leave the editor alone rather than dirty the note).
 */
export function reformatDoc(doc: PmDoc): PmDoc | null {
  const blocks = doc.content ?? [];
  const out: PmNode[] = [];
  let reformatted = false;
  let i = 0;

  while (i < blocks.length) {
    const block = blocks[i];
    if (!block) {
      i++;
      continue;
    }
    if (sourceOf(block) === null) {
      out.push(block);
      i++;
      continue;
    }
    const start = i;
    const sources: string[] = [];
    while (i < blocks.length) {
      const source = blocks[i] ? sourceOf(blocks[i] as PmNode) : null;
      if (source === null) break;
      sources.push(source);
      i++;
    }
    const run = blocks.slice(start, i);
    const parsed = reparse(joinSources(sources), start === 0);
    if (!parsed || JSON.stringify(parsed) === JSON.stringify(run)) {
      out.push(...run);
      continue;
    }
    out.push(...parsed);
    // A blank paragraph at the end of the run is where the caret was parked; the parser drops
    // it, so it is put back rather than pulling the end of the note up under the user.
    for (let j = run.length - 1; j >= 0 && isEmptyParagraph(run[j] as PmNode); j--) {
      out.push({ type: "paragraph" });
    }
    reformatted = true;
  }

  if (!reformatted) return null;
  return { ...doc, type: "doc", content: out.length ? out : [{ type: "paragraph" }] };
}

/**
 * Reformats the open note in one undoable step. `setContent` emits an update, so the editor
 * store marks the note dirty and the ordinary debounced save writes the canonical markdown.
 * Returns false when there was nothing in the note that looked like unformatted markdown.
 */
export function reformatNote(): boolean {
  const editor = getActiveEditor();
  if (!editor) return false;
  const next = reformatDoc(editor.getJSON() as PmDoc);
  if (!next) return false;
  editor.commands.setContent(next);
  return true;
}
