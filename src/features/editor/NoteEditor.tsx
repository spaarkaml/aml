import { EditorContent, useEditor } from "@tiptap/react";
import { useCallback, useEffect, useMemo } from "react";
import type { PmNode } from "@/lib/markdown";
import { setActiveEditor } from "./editorRef";
import { amlExtensions } from "./extensions";
import styles from "./NoteEditor.module.css";
import { useEditorStore } from "./store";

export function NoteEditor() {
  const path = useEditorStore((s) => s.path);
  const doc = useEditorStore((s) => s.doc);
  const docVersion = useEditorStore((s) => s.docVersion);
  const changed = useEditorStore((s) => s.changed);
  const conflict = useEditorStore((s) => s.conflict);
  const externalChanged = useEditorStore((s) => s.externalChanged);
  const reload = useEditorStore((s) => s.reloadFromDisk);
  const overwrite = useEditorStore((s) => s.overwriteDisk);
  const error = useEditorStore((s) => s.error);

  // Stable options: Tiptap re-applies changed options on every render, so fresh objects here
  // (extensions, editorProps, callbacks) would churn the view while the user types.
  const extensions = useMemo(() => amlExtensions(), []);
  const editorProps = useMemo(
    () => ({ attributes: { class: styles.prose ?? "", spellcheck: "false", lang: "en-AU" } }),
    [],
  );
  const onUpdate = useCallback(
    ({ editor: e }: { editor: { getJSON: () => unknown } }) => changed(e.getJSON() as PmNode),
    [changed],
  );

  const editor = useEditor(
    {
      extensions,
      content: null,
      // No autofocus option: Tiptap applies it on a timer, which can yank the caret to the
      // start after the user has already clicked. We focus synchronously after loading below.
      autofocus: false,
      editorProps,
      onUpdate,
    },
    [path],
  );

  useEffect(() => {
    setActiveEditor(editor);
    return () => setActiveEditor(null);
  }, [editor]);

  // Load on open and on every reload from disk; never on ordinary re-renders.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `doc` is deliberately read without being a dependency — docVersion is the reload signal
  useEffect(() => {
    if (!editor || !doc) return;
    editor.commands.setContent(doc, { emitUpdate: false });
    editor.commands.focus("start", { scrollIntoView: false });
  }, [editor, docVersion]);

  if (!path) return null;

  return (
    <div className={styles.page} data-testid="note-editor">
      {conflict || externalChanged ? (
        <div className={styles.banner} role="alert">
          <span>
            {conflict
              ? "This note changed on disk since you opened it."
              : "This note changed on disk while you were editing."}
          </span>
          <button type="button" onClick={reload}>
            Reload from disk
          </button>
          <button type="button" onClick={overwrite}>
            Keep mine
          </button>
        </div>
      ) : null}
      {error ? (
        <div className={styles.banner} role="alert">
          {error}
        </div>
      ) : null}
      <EditorContent editor={editor} className={styles.content} />
    </div>
  );
}
