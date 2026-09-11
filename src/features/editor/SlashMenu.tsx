import type { Editor } from "@tiptap/core";
import { useEffect, useMemo } from "react";
import { fuzzyFilter } from "@/lib/fuzzy";
import { BLOCK_ITEMS } from "./blocks";
import styles from "./SlashMenu.module.css";
import { useSlashStore } from "./slashStore";

/** Floating block menu opened by typing `/` at the start of a paragraph. */
export function SlashMenu({ editor }: { editor: Editor }) {
  const active = useSlashStore((s) => s.active);
  const query = useSlashStore((s) => s.query);
  const rawIndex = useSlashStore((s) => s.index);
  const left = useSlashStore((s) => s.left);
  const bottom = useSlashStore((s) => s.bottom);
  const from = useSlashStore((s) => s.from);
  const set = useSlashStore((s) => s.set);

  const items = useMemo(() => fuzzyFilter(query, BLOCK_ITEMS, (i) => i.title), [query]);
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
