import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import styles from "./TableMenu.module.css";

export function TableMenu({ editor }: { editor: Editor }) {
  const inTable = useEditorState({ editor, selector: ({ editor: e }) => e.isActive("table") });
  if (!inTable) return null;
  const run = (fn: (c: ReturnType<Editor["chain"]>) => ReturnType<Editor["chain"]>) => () =>
    fn(editor.chain().focus()).run();
  return (
    <div className={styles.menu} role="toolbar" aria-label="Table" data-testid="table-menu">
      <button type="button" onClick={run((c) => c.addRowBefore())}>
        Row ↑
      </button>
      <button type="button" onClick={run((c) => c.addRowAfter())}>
        Row ↓
      </button>
      <button type="button" onClick={run((c) => c.addColumnBefore())}>
        Col ←
      </button>
      <button type="button" onClick={run((c) => c.addColumnAfter())}>
        Col →
      </button>
      <span className={styles.sep} />
      <button type="button" onClick={run((c) => c.deleteRow())}>
        Delete row
      </button>
      <button type="button" onClick={run((c) => c.deleteColumn())}>
        Delete col
      </button>
      <button type="button" onClick={run((c) => c.toggleHeaderRow())}>
        Header row
      </button>
      <span className={styles.sep} />
      <button type="button" className={styles.danger} onClick={run((c) => c.deleteTable())}>
        Delete table
      </button>
    </div>
  );
}
