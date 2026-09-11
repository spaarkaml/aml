import { getActiveEditor } from "@/features/editor/editorRef";
import { ALLOW_FRONT_MATTER_REMOVAL } from "@/features/editor/extensions/aml-nodes";
import { useEditorStore } from "@/features/editor/store";

/** The open note's front matter, as written. Empty when it has none. */
export function currentYaml(): string {
  const doc = useEditorStore.getState().doc;
  const first = doc?.content[0];
  return first?.type === "frontMatter" ? String(first.attrs?.yaml ?? "") : "";
}

/**
 * Writes YAML into the front-matter node, creating or removing it as needed. Everything that
 * edits a note's properties goes through here — the Properties panel and the Goals section —
 * so a property is set one way and the editor's undo stack sees one kind of change.
 */
export function applyYaml(yaml: string): void {
  const editor = getActiveEditor();
  if (!editor) return;
  const { state } = editor;
  const first = state.doc.firstChild;
  const tr = state.tr.setMeta(ALLOW_FRONT_MATTER_REMOVAL, true);
  const type = state.schema.nodes.frontMatter;
  if (!type) return;
  if (first?.type.name === "frontMatter") {
    if (yaml === "") tr.delete(0, first.nodeSize);
    else tr.setNodeMarkup(0, type, { yaml });
  } else if (yaml !== "") {
    tr.insert(0, type.create({ yaml }));
  }
  editor.view.dispatch(tr);
}
