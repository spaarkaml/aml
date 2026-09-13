import type { Editor } from "@tiptap/core";
import { useDiagramStore } from "@/features/diagram/store";
import { insertFootnote } from "./footnotes";
import { useEditorStore } from "./store";

/**
 * The block actions AML offers, in one place: the `/` menu lists them, and the Command
 * Palette registers each as a "Format" command so everything is discoverable from one
 * search field (WP-2.9).
 */
export interface BlockItem {
  id: string;
  title: string;
  hint: string;
  run: (editor: Editor) => void;
}

export const BLOCK_ITEMS: BlockItem[] = [
  {
    id: "h1",
    title: "Heading 1",
    hint: "#",
    run: (e) => e.chain().focus().setHeading({ level: 1 }).run(),
  },
  {
    id: "h2",
    title: "Heading 2",
    hint: "##",
    run: (e) => e.chain().focus().setHeading({ level: 2 }).run(),
  },
  {
    id: "h3",
    title: "Heading 3",
    hint: "###",
    run: (e) => e.chain().focus().setHeading({ level: 3 }).run(),
  },
  {
    id: "bullet",
    title: "Bullet list",
    hint: "-",
    run: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    id: "numbered",
    title: "Numbered list",
    hint: "1.",
    run: (e) => e.chain().focus().toggleOrderedList().run(),
  },
  {
    id: "task",
    title: "Task list",
    hint: "- [ ]",
    run: (e) => e.chain().focus().toggleTaskList().run(),
  },
  {
    id: "quote",
    title: "Quote",
    hint: ">",
    run: (e) => e.chain().focus().toggleBlockquote().run(),
  },
  {
    id: "callout",
    title: "Callout",
    hint: "> [!note]",
    // Inserted rather than wrapped: a callout needs a title node of its own, and "wrap this
    // paragraph" would have to guess whether the paragraph was meant to be the title.
    run: (e) =>
      e
        .chain()
        .focus()
        .insertContent({
          type: "callout",
          attrs: { kind: "note", fold: null },
          content: [{ type: "calloutTitle" }, { type: "paragraph" }],
        })
        .run(),
  },
  {
    id: "code",
    title: "Code block",
    hint: "```",
    run: (e) => e.chain().focus().toggleCodeBlock().run(),
  },
  {
    id: "diagram",
    title: "Diagram",
    hint: "draw",
    run: () => {
      const path = useEditorStore.getState().path;
      if (path) useDiagramStore.getState().create(path);
    },
  },
  {
    id: "table",
    title: "Table",
    hint: "3 × 3",
    run: (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  {
    id: "divider",
    title: "Divider",
    hint: "---",
    run: (e) => e.chain().focus().setHorizontalRule().run(),
  },
  { id: "footnote", title: "Footnote", hint: "[^1]", run: (e) => void insertFootnote(e) },
  {
    id: "wiki",
    title: "Link to note",
    hint: "[[ ]]",
    run: (e) => {
      const pos = e.state.selection.from;
      e.chain()
        .focus()
        .insertContent("[[]]")
        .setTextSelection(pos + 2)
        .run();
    },
  },
  {
    id: "date",
    title: "Today's date",
    hint: new Date().toISOString().slice(0, 10),
    run: (e) => e.chain().focus().insertContent(new Date().toISOString().slice(0, 10)).run(),
  },
];
