import type { Editor } from "@tiptap/core";
import { useEffect, useMemo } from "react";
import styles from "@/features/editor/SlashMenu.module.css";
import { useQuickOpenStore } from "@/features/quickopen/store";
import { type LinkSuggestion, suggestLinks, wikiRaw } from "./complete";
import { useLinkStore } from "./store";

/** Inserts `s` as a wiki-link atom in place of the typed `[[query` (and a paired `]]`). */
function insertSuggestion(editor: Editor, from: number, query: string, s: LinkSuggestion): void {
  const type = editor.state.schema.nodes.wikiLink;
  if (!type) return;
  let to = from + 2 + query.length;
  const after = editor.state.doc.textBetween(to, Math.min(to + 2, editor.state.doc.content.size));
  if (after === "]]") to += 2;
  const node = type.create({
    target: s.target,
    heading: s.heading,
    alias: s.alias,
    raw: wikiRaw(s),
  });
  const tr = editor.state.tr.replaceWith(from, to, node);
  editor.view.dispatch(tr);
  editor.commands.focus();
}

/** Note picker opened by typing `[[`. */
export function LinkMenu({ editor }: { editor: Editor }) {
  const active = useLinkStore((s) => s.active);
  const query = useLinkStore((s) => s.query);
  const rawIndex = useLinkStore((s) => s.index);
  const left = useLinkStore((s) => s.left);
  const bottom = useLinkStore((s) => s.bottom);
  const from = useLinkStore((s) => s.from);
  const set = useLinkStore((s) => s.set);
  const entries = useQuickOpenStore((s) => s.entries);

  const items = useMemo(
    () => (active ? suggestLinks(query, entries) : []),
    [active, query, entries],
  );
  const index = items.length ? ((rawIndex % items.length) + items.length) % items.length : 0;

  useEffect(() => {
    set({ count: items.length });
  }, [items.length, set]);

  useEffect(() => {
    if (!active) return;
    const apply = () => {
      const item = items[index];
      if (item) insertSuggestion(editor, from, query, item);
    };
    window.addEventListener("aml:link-apply", apply);
    return () => window.removeEventListener("aml:link-apply", apply);
  }, [active, items, index, editor, from, query]);

  if (!active || items.length === 0) return null;

  const top = Math.min(bottom + 4, window.innerHeight - items.length * 26 - 24);
  return (
    <div
      className={styles.menu}
      role="listbox"
      aria-label="Link to note"
      style={{ left: Math.min(left, window.innerWidth - 300), top, width: 280 }}
      data-testid="link-menu"
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
            insertSuggestion(editor, from, query, item);
          }}
        >
          <span>{item.title}</span>
          <span className={styles.hint}>{item.hint}</span>
        </div>
      ))}
    </div>
  );
}
