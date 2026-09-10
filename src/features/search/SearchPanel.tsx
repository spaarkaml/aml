import { useEffect, useRef, useState } from "react";
import { useEditorStore } from "@/features/editor/store";
import { openNoteAt } from "@/features/quickopen/store";
import { parentDir } from "@/lib/paths";
import styles from "./SearchPanel.module.css";
import { useSearchStore } from "./store";

/** Renders a snippet whose hits are wrapped in `«»` by Rust. */
function Snippet({ text }: { text: string }) {
  const parts = text.split(/(«[^»]*»)/g).filter(Boolean);
  return (
    <span className={styles.snippet}>
      {parts.map((p, i) =>
        p.startsWith("«") && p.endsWith("»") ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: parts are positional fragments of one line
          <mark key={i}>{p.slice(1, -1)}</mark>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: parts are positional fragments of one line
          <span key={i}>{p}</span>
        ),
      )}
    </span>
  );
}

const HELP =
  'Words match at word starts. "phrase"  /regex/  -not  a OR b  (group)  tag:x  path:x  file:x  title:x  status:x  type:x  has:image|link|task';

/** Folio-wide search with the query language, plus replace in the open note (WP-2.5). */
export function SearchPanel() {
  const query = useSearchStore((s) => s.query);
  const results = useSearchStore((s) => s.results);
  const settled = useSearchStore((s) => s.settled);
  const total = useSearchStore((s) => s.total);
  const error = useSearchStore((s) => s.error);
  const loading = useSearchStore((s) => s.loading);
  const focusRequest = useSearchStore((s) => s.focusRequest);
  const setQuery = useSearchStore((s) => s.setQuery);
  const run = useSearchStore((s) => s.run);
  const replaceInNote = useSearchStore((s) => s.replaceInNote);
  const notePath = useEditorStore((s) => s.path);
  const inputRef = useRef<HTMLInputElement>(null);
  const [replacement, setReplacement] = useState("");
  const [replaced, setReplaced] = useState<number | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: focusRequest is the trigger
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusRequest]);

  return (
    <div className={styles.panel} data-testid="search-panel">
      <input
        ref={inputRef}
        className={styles.input}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void run();
        }}
        placeholder="Search the Folio…"
        aria-label="Search query"
        title={HELP}
        data-testid="search-input"
      />
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {query.trim() && !error ? (
        <p className={styles.summary} data-testid="search-summary">
          {loading
            ? "Searching…"
            : `${total.toLocaleString("en-AU")} ${total === 1 ? "note" : "notes"}${
                total > results.length ? ` (showing ${results.length})` : ""
              }`}
        </p>
      ) : (
        <p className={styles.help}>{HELP}</p>
      )}
      <ul className={styles.list} data-testid="search-results" data-query={settled}>
        {results.map((r) => (
          <li key={r.path} className={styles.result}>
            <button
              type="button"
              className={styles.note}
              onClick={() => openNoteAt(r.path, r.snippets[0]?.section ?? null)}
              title={r.path}
            >
              <span className={styles.title}>{r.title}</span>
              <span className={styles.meta}>
                {parentDir(r.path) || "/"}
                {r.matches > 0 ? ` · ${r.matches}` : ""}
              </span>
            </button>
            {r.snippets.map((s) => (
              <button
                type="button"
                key={s.line}
                className={styles.line}
                onClick={() => openNoteAt(r.path, s.section)}
                title={s.section ? `› ${s.section}` : undefined}
              >
                <span className={styles.lineNo}>{s.line}</span>
                <Snippet text={s.text} />
              </button>
            ))}
          </li>
        ))}
      </ul>
      {notePath && query.trim() ? (
        <form
          className={styles.replace}
          onSubmit={(e) => {
            e.preventDefault();
            setReplaced(replaceInNote(replacement));
          }}
        >
          <input
            className={styles.input}
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            placeholder="Replace with…"
            aria-label="Replacement text"
            data-testid="replace-input"
          />
          <button type="submit" className={styles.small} data-testid="replace-run">
            Replace in this note
          </button>
          {replaced !== null ? (
            <span className={styles.meta} data-testid="replace-count">
              {replaced} replaced
            </span>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
