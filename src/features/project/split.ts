import { getActiveEditor } from "@/features/editor/editorRef";
import { useEditorStore } from "@/features/editor/store";
import { freeName, useFolioStore } from "@/features/folio/store";
import { useTabsStore } from "@/features/tabs/store";
import { commands } from "@/ipc";
import { docToMarkdown, type PmNode } from "@/lib/markdown";
import { joinPath, parentDir } from "@/lib/paths";
import { useProjectStore } from "./store";

/** A heading, or the first few words, or nothing — what the new document is called. */
export function titleOf(markdown: string): string {
  const heading = /^#{1,6}[ \t]+(.+?)[ \t]*#*$/m.exec(markdown)?.[1];
  const source =
    heading ??
    markdown
      .split("\n")
      .find((l) => l.trim())
      ?.trim() ??
    "";
  const name = source
    .replace(/[#*_`[\]()]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .join(" ")
    .replace(/[/\\:]/g, "-")
    .trim();
  return name || "Untitled";
}

/**
 * Splits the open note at the caret: everything after it becomes a new document beside this
 * one, named after its first heading, and placed right after it in the Binder.
 *
 * The order is deliberate. The tail is written to its own file *before* a character is
 * removed from the note it came from, so a failure anywhere leaves the text in two places
 * rather than none. ADR-006 would have a snapshot taken before a destructive edit and the
 * snapshot engine does not exist yet (WP-4.1); writing before deleting is what makes this
 * safe without one, and the editor's own undo still puts the note back.
 */
export async function splitAtCursor(): Promise<string | null> {
  const editor = getActiveEditor();
  const path = useEditorStore.getState().path;
  if (!editor || !path) return null;

  const { doc, selection } = editor.state;
  const end = doc.content.size;
  // A caret at the top of a block splits *above* that block, so the half left behind does
  // not keep an empty heading and the half that leaves begins with its own title.
  const $head = selection.$head;
  const head = $head.parentOffset === 0 && $head.depth >= 1 ? $head.before(1) : selection.head;
  if (head >= end) return null;
  const markdown = docToMarkdown(doc.cut(head, end).toJSON() as PmNode).replace(/^\n+/, "");
  if (!markdown.trim()) return null;

  const dir = parentDir(path);
  const tree = useFolioStore.getState().tree;
  const target = joinPath(dir, freeName(tree, dir, titleOf(markdown), ".md"));

  const created = await commands.entryCreateNote(target);
  if (created.status === "error") return null;
  const written = await commands.noteWrite(target, markdown, null);
  if (written.status === "error") return null;

  editor.chain().focus().deleteRange({ from: head, to: end }).run();
  await useEditorStore.getState().saveNow();
  await useFolioStore.getState().refreshTree();

  const project = useProjectStore.getState();
  if (project.current && target.startsWith(`${project.current}/`)) {
    await project.refresh();
    const cut = project.current.length + 1;
    await project.insertAfter(path.slice(cut), target.slice(cut));
  }
  useTabsStore.getState().open(target);
  return target;
}
