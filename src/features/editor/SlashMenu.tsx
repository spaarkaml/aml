import type { Editor } from "@tiptap/core";
import { useEffect, useMemo } from "react";
import { fuzzyFilter } from "@/lib/fuzzy";
import { insertFootnote } from "./footnotes";
import styles from "./SlashMenu.module.css";
import { useSlashStore } from "./slashStore";

interface Item {
  id: string;
  title: string;
  hint: string;
  run: (editor: Editor) => void;
}

const ITEMS: Item[] = [
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
    id: "code",
    title: "Code block",
    hint: "```",
    run: (e) => e.chain().focus().toggleCodeBlock().run(),
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

/** Floating block menu opened by typing `/` at the start of a paragraph. */
export function SlashMenu({ editor }: { editor: Editor }) {
  const active = useSlashStore((s) => s.active);
  const query = useSlashStore((s) => s.query);
  const rawIndex = useSlashStore((s) => s.index);
  const left = useSlashStore((s) => s.left);
  const bottom = useSlashStore((s) => s.bottom);
  const from = useSlashStore((s) => s.from);
  const set = useSlashStore((s) => s.set);

  const items = useMemo(() => fuzzyFilter(query, ITEMS, (i) => i.title), [query]);
  const index = items.length ? ((rawIndex % items.length) + items.length) % items.length : 0;

  useEffect(() => {
    if (!active) return;
    const apply = () => {
      const item = items[index];
      if (!item) return;
      editor
        .chain()
        .focus()
        .deleteRange({ from, to: from + 1 + query.length })
        .run();
      item.run(editor);
    };
    window.addEventListener("aml:slash-apply", apply);
    return () => window.removeEventListener("aml:slash-apply", apply);
  }, [active, items, index, editor, from, query]);

  if (!active) return null;
  if (items.length === 0) return null;

  const top = Math.min(bottom + 4, window.innerHeight - items.length * 26 - 24);
  return (
    <div
      className={styles.menu}
      role="listbox"
      aria-label="Insert block"
      style={{ left: Math.min(left, window.innerWidth - 260), top }}
      data-testid="slash-menu"
    >
      {items.map((item, i) => (
        <div
          key={item.id}
          role="option"
          tabIndex={-1}
          aria-selected={i === index}
          className={i === index ? styles.itemActive : styles.item}
          onMouseEnter={() => set({ index: i })}
          onMouseDown={(e) => {
            e.preventDefault();
            set({ index: i });
            window.dispatchEvent(new CustomEvent("aml:slash-apply"));
          }}
        >
          <span>{item.title}</span>
          <span className={styles.hint}>{item.hint}</span>
        </div>
      ))}
    </div>
  );
}
