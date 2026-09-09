import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { useEffect, useState } from "react";
import styles from "./SelectionToolbar.module.css";

/** Formatting toolbar that floats above a non-empty text selection. */
export function SelectionToolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const { from, to, empty } = e.state.selection;
      const hasText =
        !empty && !e.isActive("codeBlock") && e.state.doc.textBetween(from, to).length > 0;
      return {
        hasText,
        focused: e.isFocused,
        from,
        bold: e.isActive("bold"),
        italic: e.isActive("italic"),
        strike: e.isActive("strike"),
        code: e.isActive("code"),
        link: e.isActive("link"),
        h1: e.isActive("heading", { level: 1 }),
        h2: e.isActive("heading", { level: 2 }),
        h3: e.isActive("heading", { level: 3 }),
      };
    },
  });
  const [linkMode, setLinkMode] = useState(false);
  const [href, setHref] = useState("");

  // The link field takes focus from the editor; keep the toolbar while it is in use and
  // drop it only when the selection itself is gone.
  useEffect(() => {
    if (!state.hasText) setLinkMode(false);
  }, [state.hasText]);

  if (!state.hasText || (!state.focused && !linkMode)) return null;

  const coords = editor.view.coordsAtPos(state.from);
  const top = Math.max(8, coords.top - 40);
  const left = Math.max(8, Math.min(coords.left, window.innerWidth - 340));
  const btn = (label: string, active: boolean, run: () => void, title: string) => (
    <button
      type="button"
      aria-pressed={active}
      aria-label={title}
      title={title}
      onMouseDown={(e) => {
        e.preventDefault();
        run();
      }}
    >
      {label}
    </button>
  );
  const chain = () => editor.chain().focus();

  return (
    <div
      className={styles.toolbar}
      role="toolbar"
      aria-label="Formatting"
      style={{ top, left }}
      data-testid="selection-toolbar"
    >
      {linkMode ? (
        <form
          className={styles.linkForm}
          onSubmit={(e) => {
            e.preventDefault();
            const url = href.trim();
            if (url) chain().extendMarkRange("link").setLink({ href: url }).run();
            setLinkMode(false);
            setHref("");
          }}
        >
          <input
            // biome-ignore lint/a11y/noAutofocus: the field appears on an explicit click and needs the caret
            autoFocus
            value={href}
            onChange={(e) => setHref(e.target.value)}
            placeholder="https://…"
            aria-label="Link URL"
            data-testid="link-url"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setLinkMode(false);
                editor.commands.focus();
              }
            }}
          />
          <button type="submit">Link</button>
        </form>
      ) : (
        <>
          {btn("B", state.bold, () => chain().toggleBold().run(), "Bold")}
          {btn("I", state.italic, () => chain().toggleItalic().run(), "Italic")}
          {btn("S", state.strike, () => chain().toggleStrike().run(), "Strikethrough")}
          {btn("<>", state.code, () => chain().toggleCode().run(), "Code")}
          {btn(
            "Link",
            state.link,
            () => {
              if (state.link) chain().unsetLink().run();
              else {
                setHref(String(editor.getAttributes("link").href ?? ""));
                setLinkMode(true);
              }
            },
            state.link ? "Remove link" : "Add link",
          )}
          <span className={styles.sep} />
          {btn("H1", state.h1, () => chain().toggleHeading({ level: 1 }).run(), "Heading 1")}
          {btn("H2", state.h2, () => chain().toggleHeading({ level: 2 }).run(), "Heading 2")}
          {btn("H3", state.h3, () => chain().toggleHeading({ level: 3 }).run(), "Heading 3")}
        </>
      )}
    </div>
  );
}
