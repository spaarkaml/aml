import { useEffect, useMemo, useRef, useState } from "react";
import styles from "@/features/commands/CommandPalette.module.css";
import { useFolioStore } from "@/features/folio/store";
import { useTabsStore } from "@/features/tabs/store";
import { noteTitle, parentDir } from "@/lib/paths";
import { hasExactTitle, type NoteMatch, searchNotes } from "./search";
import { openNoteAt, useQuickOpenStore } from "./store";

const KIND_LABEL: Record<NoteMatch["kind"], string> = {
  title: "",
  alias: "alias",
  heading: "heading",
  path: "",
  recent: "recent",
};

/** ⌘O: fuzzy jump to any note by title, alias, heading or path; empty query shows recents. */
export function QuickOpen() {
  const open = useQuickOpenStore((s) => s.open);
  const setOpen = useQuickOpenStore((s) => s.setOpen);
  const entries = useQuickOpenStore((s) => s.entries);
  const recents = useTabsStore((s) =>
    s.folioRoot ? (s.byFolio[s.folioRoot]?.recents ?? EMPTY) : EMPTY,
  );
  const createNote = useFolioStore((s) => s.createNote);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => searchNotes(query, entries, recents), [query, entries, recents]);
  const canCreate = query.trim().length > 0 && !hasExactTitle(query, entries);
  const rows = results.length + (canCreate ? 1 : 0);

  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setIndex((i) => Math.min(i, Math.max(0, rows - 1)));
  }, [rows]);

  if (!open) return null;

  const choose = (i: number) => {
    const m = results[i];
    setOpen(false);
    if (m) {
      setTimeout(() => openNoteAt(m.path, m.kind === "heading" ? m.detail : null), 0);
    } else if (canCreate) {
      const name = query.trim().replace(/[/\\]/g, "-");
      setTimeout(() => void createNote("", name), 0);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((i) => (rows ? (i + 1) % rows : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) => (rows ? (i - 1 + rows) % rows : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(index);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div className={styles.backdrop} data-testid="quickopen-backdrop">
      <button
        type="button"
        className={styles.backdropButton}
        onMouseDown={() => setOpen(false)}
        tabIndex={-1}
        aria-label="Close Quick Open"
      />
      <div className={styles.panel} role="dialog" aria-label="Quick Open">
        <input
          ref={inputRef}
          className={styles.input}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Open a note by title, alias or heading…"
          aria-label="Search notes"
          data-testid="quickopen-input"
        />
        <div className={styles.list} role="listbox" aria-label="Notes">
          {rows === 0 ? (
            <div className={styles.empty}>
              {entries.length === 0 ? "No notes in this Folio yet" : "No matching notes"}
            </div>
          ) : null}
          {results.map((m, i) => (
            <div
              key={m.path}
              role="option"
              tabIndex={-1}
              aria-selected={i === index}
              className={i === index ? styles.itemActive : styles.item}
              onMouseEnter={() => setIndex(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(i);
              }}
              data-path={m.path}
            >
              <span className={styles.label}>
                <span>{m.title}</span>
                {m.kind === "alias" || m.kind === "heading" ? (
                  <span className={styles.detail}>
                    {m.kind === "heading" ? "# " : "= "}
                    {m.detail}
                  </span>
                ) : null}
                <span className={styles.detail}>{parentDir(m.path) || ""}</span>
              </span>
              {KIND_LABEL[m.kind] ? <span className={styles.kbd}>{KIND_LABEL[m.kind]}</span> : null}
            </div>
          ))}
          {canCreate ? (
            <div
              role="option"
              tabIndex={-1}
              aria-selected={index === results.length}
              className={index === results.length ? styles.itemActive : styles.item}
              onMouseEnter={() => setIndex(results.length)}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(results.length);
              }}
              data-testid="quickopen-create"
            >
              <span>Create note “{noteTitle(query.trim())}”</span>
              <span className={styles.kbd}>new</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const EMPTY: string[] = [];
