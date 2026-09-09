import type { EditorView } from "@tiptap/pm/view";
import { imageFilesFrom, pastedImageName, storeImage } from "./assets";
import { useEditorStore } from "./store";

/**
 * Paste/drop of image files → stored in the Folio's assets folder → inserted as image nodes.
 * Returns true when handled so ProseMirror skips its default behaviour.
 */
async function insertImages(view: EditorView, files: File[], pos?: number): Promise<void> {
  const notePath = useEditorStore.getState().path;
  if (!notePath) return;
  let insertAt = pos ?? view.state.selection.from;
  for (const [i, file] of files.entries()) {
    const stored = await storeImage(notePath, file, pastedImageName(file, i));
    if (!stored) continue;
    const node = view.state.schema.nodes.image?.create({
      src: stored.markdownPath,
      alt: stored.alt,
    });
    if (!node) return;
    const tr = view.state.tr.insert(insertAt, node);
    view.dispatch(tr);
    insertAt += node.nodeSize;
  }
}

export function handlePaste(view: EditorView, event: ClipboardEvent): boolean {
  const files = imageFilesFrom(event.clipboardData);
  if (files.length === 0) return false;
  event.preventDefault();
  void insertImages(view, files);
  return true;
}

export function handleDrop(
  view: EditorView,
  event: DragEvent,
  _slice: unknown,
  moved: boolean,
): boolean {
  if (moved) return false;
  const files = imageFilesFrom(event.dataTransfer);
  if (files.length === 0) return false;
  event.preventDefault();
  const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
  void insertImages(view, files, pos);
  return true;
}
