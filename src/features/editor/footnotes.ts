import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";

/** Next unused numeric footnote id in the document. */
export function nextFootnoteId(editor: Editor): string {
  let max = 0;
  editor.state.doc.descendants((n) => {
    if (n.type.name === "footnoteRef" || n.type.name === "footnoteDef") {
      const v = Number.parseInt(String(n.attrs.id ?? ""), 10);
      if (!Number.isNaN(v)) max = Math.max(max, v);
    }
  });
  return String(max + 1);
}

/** Inserts a footnote reference at the caret and an empty definition at the end of the note. */
export function insertFootnote(editor: Editor): boolean {
  const id = nextFootnoteId(editor);
  const { schema } = editor.state;
  const ref = schema.nodes.footnoteRef?.create({ id, label: id });
  const def = schema.nodes.footnoteDef?.create({ id, label: id }, schema.nodes.paragraph?.create());
  if (!ref || !def) return false;
  const tr = editor.state.tr;
  tr.insert(tr.selection.from, ref);
  const end = tr.doc.content.size;
  tr.insert(end, def);
  // Put the caret inside the new definition's paragraph so the user can type the note.
  tr.setSelection(TextSelection.create(tr.doc, end + 2));
  editor.view.dispatch(tr);
  editor.view.focus();
  return true;
}
