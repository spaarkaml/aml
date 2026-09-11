import { EditorContent, useEditor } from "@tiptap/react";
import { useCallback, useEffect, useMemo } from "react";
import { LinkMenu } from "@/features/links/LinkMenu";
import { SpellMenu } from "@/features/spell/SpellMenu";
import { useWritingStore } from "@/features/writing/store";
import type { PmNode } from "@/lib/markdown";
import { setActiveEditor } from "./editorRef";
import { amlExtensions } from "./extensions";
import styles from "./NoteEditor.module.css";
import { handleDrop, handlePaste } from "./paste";
import { SelectionToolbar } from "./SelectionToolbar";
import { SlashMenu } from "./SlashMenu";
import { useEditorStore } from "./store";
import { TableMenu } from "./TableMenu";

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
  const typewriter = useWritingStore((s) => s.typewriter);

  // Stable options: Tiptap re-applies changed options on every render, so fresh objects here
  // (extensions, editorProps, callbacks) would churn the view while the user types.
  const extensions = useMemo(() => amlExtensions(), []);
  const editorProps = useMemo(
    () => ({
      attributes: { class: styles.prose ?? "", spellcheck: "false", lang: "en-AU" },
      handlePaste,
      handleDrop,
    }),
    [],
  );
  const onUpdate = useCallback(
    ({ editor: e }: { editor: { getJSON: () => unknown } }) => changed(e.getJSON() as PmNode),
    [changed],
  );

  // The editor is (re)created with its content whenever the note or its on-disk version
  // changes. Loading content after mount (setContent in an effect) proved racy: it could
  // land after the user's first click and move the caret. No timer-based autofocus either.
  // `initial` is frozen per (path, docVersion): the live `doc` changes on every keystroke and
  // must not be handed to Tiptap as `content` or it would reset the view while typing.
  // biome-ignore lint/correctness/useExhaustiveDependencies: docVersion is the reload signal; doc is read only when it changes
  const initial = useMemo(() => doc, [path, docVersion]);
  const editor = useEditor(
    {
      extensions,
      content: initial,
      autofocus: false,
      editorProps,
      onUpdate,
    },
    [path, docVersion],
  );

  useEffect(() => {
    setActiveEditor(editor);
    return () => setActiveEditor(null);
  }, [editor]);

  // Focus once per editor instance, after EditorContent has mounted the view (child effects
  // run first). Focusing earlier — in `onCreate` or a layout effect, before the view is in
  // the document — left ProseMirror ignoring later mouse selections.
  useEffect(() => {
    // Do not steal focus from a text field the user is already typing in (e.g. the
    // Browser's inline rename that opens together with a new note).
    const el = document.activeElement;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
    editor?.commands.focus("start", { scrollIntoView: false });
  }, [editor]);

  if (!path) return null;

  return (
    <div
      className={typewriter ? `${styles.page} ${styles.typewriter}` : styles.page}
      // The Typewriter scroller finds its container by this marker.
      data-scroll="editor"
      data-testid="note-editor"
    >
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
      {editor ? <TableMenu editor={editor} /> : null}
      {editor ? <SelectionToolbar editor={editor} /> : null}
      {editor ? <SlashMenu editor={editor} /> : null}
      {editor ? <LinkMenu editor={editor} /> : null}
      {editor ? <SpellMenu editor={editor} /> : null}
      <EditorContent editor={editor} className={styles.content} />
    </div>
  );
}
