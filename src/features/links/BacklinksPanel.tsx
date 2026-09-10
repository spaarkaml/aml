import { useEffect } from "react";
import { useEditorStore } from "@/features/editor/store";
import { openNoteAt } from "@/features/quickopen/store";
import type { Backlink, Mention } from "@/ipc";
import styles from "./BacklinksPanel.module.css";
import { useBacklinksStore } from "./backlinksStore";
import { useLinkStore } from "./store";

/** Stable React keys: `source:line`, suffixed when several rows share one line. */
function withKeys<T extends { source: string; line: number }>(
  rows: T[],
): Array<T & { key: string }> {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const base = `${r.source}:${r.line}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return { ...r, key: n === 0 ? base : `${base}#${n}` };
  });
}

function Context({ text, mark }: { text: string; mark?: string | undefined }) {
  if (!mark) return <span className={styles.context}>{text}</span>;
  const i = text.toLowerCase().indexOf(mark.toLowerCase());
  if (i === -1) return <span className={styles.context}>{text}</span>;
  return (
    <span className={styles.context}>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + mark.length)}</mark>
      {text.slice(i + mark.length)}
    </span>
  );
}

function Row({
  item,
  mark,
}: {
  item: Pick<Backlink, "source" | "sourceTitle" | "section" | "context">;
  mark?: string | undefined;
}) {
  return (
    <button
      type="button"
      className={styles.row}
      onClick={() => openNoteAt(item.source, item.section)}
      title={item.source}
    >
      <span className={styles.source}>
        {item.sourceTitle}
        {item.section ? <span className={styles.section}> › {item.section}</span> : null}
      </span>
      <Context text={item.context} mark={mark} />
    </button>
  );
}

/** Linked and unlinked mentions of the open note (WP-2.3). */
export function BacklinksPanel() {
  const path = useEditorStore((s) => s.path);
  const version = useLinkStore((s) => s.version);
  const backlinks = useBacklinksStore((s) => s.backlinks);
  const mentions = useBacklinksStore((s) => s.mentions);
  const loading = useBacklinksStore((s) => s.loading);
  const load = useBacklinksStore((s) => s.load);
  const linkMention = useBacklinksStore((s) => s.linkMention);
  const linkAll = useBacklinksStore((s) => s.linkAll);

  // Reload when the note changes and whenever the Folio changed on disk (link cache bump).
  // biome-ignore lint/correctness/useExhaustiveDependencies: version is the reload trigger
  useEffect(() => {
    void load(path);
  }, [path, version, load]);

  if (!path) return <p className={styles.empty}>Open a note to see what links here.</p>;

  return (
    <div className={styles.panel} data-testid="backlinks-panel">
      <h3 className={styles.head}>
        <span>Linked mentions · {backlinks.length}</span>
      </h3>
      {backlinks.length === 0 ? (
        <p className={styles.empty}>{loading ? "Looking…" : "No notes link here yet."}</p>
      ) : (
        <ul className={styles.list} data-testid="backlinks-list">
          {withKeys(backlinks).map((b) => (
            <li key={b.key}>
              <Row item={b} />
            </li>
          ))}
        </ul>
      )}
      <h3 className={styles.head}>
        <span>Unlinked mentions · {mentions.length}</span>
        {mentions.length > 1 ? (
          <button type="button" className={styles.small} onClick={() => void linkAll()}>
            Link all
          </button>
        ) : null}
      </h3>
      {mentions.length === 0 ? (
        <p className={styles.empty}>{loading ? "Looking…" : "No unlinked mentions."}</p>
      ) : (
        <ul className={styles.list} data-testid="mentions-list">
          {withKeys(mentions).map((m: Mention & { key: string }) => (
            <li key={m.key} className={styles.mention}>
              <Row item={m} mark={m.matched} />
              <button
                type="button"
                className={styles.small}
                onClick={() => void linkMention(m)}
                title={`Turn “${m.matched}” into a link`}
              >
                Link
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
