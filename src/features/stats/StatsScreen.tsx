import { useEffect } from "react";
import { useEditorStore } from "@/features/editor/store";
import { noteTitle } from "@/lib/paths";
import styles from "./StatsScreen.module.css";
import { figure, sectionsOf, statsOf } from "./stats";
import { useStatsStore } from "./store";

/** Statistics for the open note (WP-3.7): the figures, then where the words actually are. */
export function StatsScreen() {
  const open = useStatsStore((s) => s.open);
  const setOpen = useStatsStore((s) => s.setOpen);
  const path = useEditorStore((s) => s.path);
  const doc = useEditorStore((s) => s.doc);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open) return null;

  const stats = statsOf(doc);
  const sections = sectionsOf(doc);
  const longest = Math.max(1, ...sections.map((s) => s.words));

  return (
    <div className={styles.backdrop} data-testid="stats-backdrop">
      <button
        type="button"
        className={styles.backdropButton}
        onMouseDown={() => setOpen(false)}
        tabIndex={-1}
        aria-label="Close statistics"
      />
      <div className={styles.panel} role="dialog" aria-label="Statistics">
        <div className={styles.head}>
          <h2 className={styles.title}>Statistics</h2>
          <button
            type="button"
            className={styles.small}
            onClick={() => setOpen(false)}
            data-testid="stats-close"
          >
            Done
          </button>
        </div>
        <p className={styles.where}>
          {path ? noteTitle(path) : "No note open."}
          {path
            ? " · counted the way the status bar counts: front matter, code and comments are not prose."
            : ""}
        </p>

        <ul className={styles.figures} data-testid="stats-figures">
          <Figure label="Words" value={figure(stats.words)} testId="stat-words" />
          <Figure label="Characters" value={figure(stats.characters)} testId="stat-characters" />
          <Figure
            label="Without spaces"
            value={figure(stats.charactersNoSpaces)}
            testId="stat-characters-bare"
          />
          <Figure label="Sentences" value={figure(stats.sentences)} testId="stat-sentences" />
          <Figure label="Paragraphs" value={figure(stats.paragraphs)} testId="stat-paragraphs" />
          <Figure label="Reading time" value={`${stats.minutes} min`} testId="stat-minutes" />
        </ul>

        <section className={styles.section}>
          <h3 className={styles.heading}>Readability</h3>
          {stats.readability ? (
            <p className={styles.readability} data-testid="stats-readability">
              <span className={styles.figureValue}>{stats.readability.label}</span>
              <span className={styles.meta}>
                Flesch reading ease {stats.readability.ease} · Flesch–Kincaid grade{" "}
                {stats.readability.grade}
              </span>
            </p>
          ) : (
            <p className={styles.meta} data-testid="stats-readability">
              Too little text to say — both measures need a few sentences before they mean anything.
            </p>
          )}
        </section>

        <section className={styles.section}>
          <h3 className={styles.heading}>Where the words are</h3>
          {sections.length === 0 ? (
            <p className={styles.meta} data-testid="stats-sections">
              No headings yet.
            </p>
          ) : (
            <ul className={styles.sections} data-testid="stats-sections">
              {sections.map((s, i) => (
                <li
                  // Two headings can have the same text at the same depth; position is the id.
                  // biome-ignore lint/suspicious/noArrayIndexKey: sections are positional
                  key={`${i}-${s.text}`}
                  className={styles.row}
                  style={{ paddingLeft: `calc(var(--aml-space-2) * ${s.depth})` }}
                  data-testid={`stats-section-${i}`}
                >
                  <span className={styles.sectionName}>
                    {s.text || <span className={styles.meta}>Before the first heading</span>}
                  </span>
                  <span className={styles.bar} aria-hidden="true">
                    <span
                      className={styles.fill}
                      style={{ width: `${(s.words / longest) * 100}%` }}
                    />
                  </span>
                  <span className={styles.sectionWords}>{figure(s.words)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Figure({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <li className={styles.figure}>
      <span className={styles.figureValue} data-testid={testId}>
        {value}
      </span>
      <span className={styles.figureLabel}>{label}</span>
    </li>
  );
}
