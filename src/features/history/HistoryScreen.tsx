import { useEffect, useMemo } from "react";
import { Icon } from "@/app/icons";
import { changes, type Hunk, hunks, type Segment, words } from "@/features/conflicts/merge";
import { noteTitle } from "@/lib/paths";
import styles from "./HistoryScreen.module.css";
import { NOW, useHistoryStore } from "./store";
import { groupByDay, nameOf, takenAt, timeOf } from "./timeline";

function keyed<T extends object>(list: T[]): (T & { id: string })[] {
  return list.map((item, i) => ({ ...item, id: String(i) }));
}

/** One side of a changed stretch, with the words only this side has marked. */
function Lines({ mine, other, side }: { mine: string[]; other: string[]; side: "then" | "now" }) {
  const rows = keyed(
    mine
      .map((line, i) => ({ line, pair: other[i] }))
      .filter(({ line }) => line.trim() !== "")
      .map(({ line, pair }) => {
        const segments: Segment[] =
          pair !== undefined && pair.trim() !== ""
            ? side === "then"
              ? words(line, pair).original
              : words(pair, line).copy
            : [{ text: line, kind: side === "then" ? "removed" : "added" }];
        return { segments: keyed(segments) };
      }),
  );
  if (rows.length === 0) return null;
  return (
    <div className={side === "then" ? styles.then : styles.now}>
      {rows.map((row) => (
        <p key={row.id} className={styles.para}>
          {row.segments.map((seg) => (
            <span
              key={seg.id}
              className={
                seg.kind === "removed"
                  ? styles.removed
                  : seg.kind === "added"
                    ? styles.added
                    : undefined
              }
            >
              {seg.text}
            </span>
          ))}
        </p>
      ))}
    </div>
  );
}

/** What both share, shortened to the paragraphs either side of a change. */
function Unchanged({ lines, before, after }: { lines: string[]; before: boolean; after: boolean }) {
  const text = lines.filter((l) => l.trim() !== "");
  if (text.length === 0) return null;
  const long = text.length > 3;
  const head = long ? (before ? text.slice(0, 1) : []) : text;
  const tail = long && after ? text.slice(-1) : [];
  const hidden = long ? text.length - head.length - tail.length : 0;
  return (
    <div className={styles.unchanged}>
      {keyed(head.map((t) => ({ t }))).map((l) => (
        <p key={`h${l.id}`} className={styles.contextLine}>
          {l.t}
        </p>
      ))}
      {hidden > 0 ? (
        <span className={styles.gap}>
          {hidden} unchanged {hidden === 1 ? "paragraph" : "paragraphs"}
        </span>
      ) : null}
      {keyed(tail.map((t) => ({ t }))).map((l) => (
        <p key={`t${l.id}`} className={styles.contextLine}>
          {l.t}
        </p>
      ))}
    </div>
  );
}

function Changes({ list }: { list: Hunk[] }) {
  const rows = list.map((h, i) => ({
    h,
    id: h.kind === "change" ? `c${h.id}` : `s${i}`,
    before: list[i - 1]?.kind === "change",
    after: list[i + 1]?.kind === "change",
  }));
  return (
    <>
      {rows.map(({ h, id, before, after }) =>
        h.kind === "same" ? (
          <Unchanged key={id} lines={h.lines} before={before} after={after} />
        ) : (
          <div key={id} className={styles.change}>
            <Lines mine={h.original} other={h.copy} side="then" />
            <Lines mine={h.copy} other={h.original} side="now" />
          </div>
        ),
      )}
    </>
  );
}

/** The Snapshot as it was, with the paragraphs that have since changed tinted. */
function Whole({ list }: { list: Hunk[] }) {
  const paras = keyed(
    list.flatMap((h) =>
      h.kind === "same"
        ? h.lines.map((t) => ({ t, changed: false }))
        : h.original.map((t) => ({ t, changed: true })),
    ),
  ).filter((p) => p.t.trim() !== "");
  return (
    <div className={styles.whole}>
      {paras.map((p) => (
        <p key={p.id} className={p.changed ? styles.wholeChanged : styles.para}>
          {p.t}
        </p>
      ))}
    </div>
  );
}

/**
 * History (WP-4.1): a note's Snapshots down the side, what changed since the one you pick, and
 * putting it back. Opened from the status bar's *Saved*, the editor's right-click menu or the
 * palette; nothing about it is in the way of writing.
 */
export function HistoryScreen() {
  const open = useHistoryStore((s) => s.open);
  const path = useHistoryStore((s) => s.path);
  const list = useHistoryStore((s) => s.list);
  const current = useHistoryStore((s) => s.current);
  const selected = useHistoryStore((s) => s.selected);
  const against = useHistoryStore((s) => s.against);
  const texts = useHistoryStore((s) => s.texts);
  const view = useHistoryStore((s) => s.view);
  const labelling = useHistoryStore((s) => s.labelling);
  const label = useHistoryStore((s) => s.label);
  const busy = useHistoryStore((s) => s.busy);
  const error = useHistoryStore((s) => s.error);
  const store = useHistoryStore.getState;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const s = useHistoryStore.getState();
      if (e.key === "Escape") {
        if (s.labelling) s.cancelLabel();
        else s.close();
        return;
      }
      if ((e.key !== "ArrowDown" && e.key !== "ArrowUp") || e.target instanceof HTMLInputElement)
        return;
      if (e.target instanceof HTMLSelectElement) return;
      const at = s.list.findIndex((x) => x.id === s.selected);
      const next = s.list[e.key === "ArrowDown" ? at + 1 : Math.max(0, at - 1)];
      if (next) {
        e.preventDefault();
        void s.select(next.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const snapshot = list.find((s) => s.id === selected) ?? null;
  const thenText = selected ? texts[selected] : undefined;
  const otherText = against === NOW ? current : texts[against];
  const diff = useMemo(
    () =>
      thenText !== undefined && otherText !== undefined && otherText !== null
        ? hunks(thenText, otherText)
        : null,
    [thenText, otherText],
  );

  if (!open || !path) return null;

  const now = new Date();
  const days = groupByDay(list, now);
  const count = diff ? changes(diff).length : 0;
  const againstName =
    against === NOW
      ? "the note now"
      : (() => {
          const other = list.find((s) => s.id === against);
          return other ? nameOf(other, now) : "another snapshot";
        })();
  const sameAsNow = thenText !== undefined && thenText === current;

  return (
    <div className={styles.backdrop} data-testid="history-screen">
      <button
        type="button"
        className={styles.backdropButton}
        onMouseDown={() => store().close()}
        tabIndex={-1}
        aria-label="Close history"
      />
      <div className={styles.panel} role="dialog" aria-label="Note history">
        <div className={styles.head}>
          <h2>History</h2>
          <span className={styles.noteName}>{noteTitle(path)}</span>
          <div className={styles.spacer} />
          <button
            type="button"
            className={styles.close}
            onClick={() => store().close()}
            aria-label="Close"
          >
            <Icon name="close" />
          </button>
        </div>

        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}

        <div className={styles.body}>
          <aside className={styles.timeline}>
            {labelling ? (
              <form
                className={styles.labelForm}
                onSubmit={(e) => {
                  e.preventDefault();
                  void store().take();
                }}
              >
                <input
                  className={styles.input}
                  value={label}
                  // biome-ignore lint/a11y/noAutofocus: the field is the only reason this form appeared
                  autoFocus
                  placeholder="Label (optional)"
                  aria-label="Snapshot label"
                  maxLength={60}
                  onChange={(e) => store().setLabel(e.target.value)}
                  data-testid="snapshot-label"
                />
                <div className={styles.labelActions}>
                  <button type="button" className={styles.link} onClick={store().cancelLabel}>
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className={styles.primary}
                    disabled={busy}
                    data-testid="snapshot-keep"
                  >
                    Keep
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                className={styles.take}
                onClick={store().startLabel}
                disabled={busy}
                data-testid="snapshot-take"
              >
                <Icon name="plus" size={12} />
                Take snapshot
              </button>
            )}

            {list.length === 0 && !busy ? (
              <p className={styles.empty} data-testid="history-empty">
                No snapshots of this note yet. One is kept when you start changing it, and every 30
                minutes while you keep writing.
              </p>
            ) : (
              <ol className={styles.days} data-testid="history-list">
                {days.map((day) => (
                  <li key={day.key}>
                    <span className={styles.day}>{day.heading}</span>
                    <ul className={styles.items}>
                      {day.items.map((s) => (
                        <li key={s.id}>
                          <button
                            type="button"
                            className={s.id === selected ? styles.itemOn : styles.item}
                            aria-current={s.id === selected}
                            onClick={() => void store().select(s.id)}
                          >
                            <span className={styles.time}>{timeOf(takenAt(s))}</span>
                            {s.label ? <span className={styles.label}>{s.label}</span> : null}
                            <span className={styles.words}>
                              {s.words.toLocaleString("en-AU")} words
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            )}
          </aside>

          <section className={styles.detail}>
            {snapshot ? (
              <>
                <div className={styles.bar}>
                  <span className={styles.summary} data-testid="history-summary">
                    {sameAsNow && against === NOW
                      ? "The same as the note now."
                      : diff
                        ? `${count} ${count === 1 ? "change" : "changes"} from this snapshot to`
                        : "Reading…"}
                  </span>
                  {!(sameAsNow && against === NOW) && diff ? (
                    <select
                      className={styles.select}
                      value={against}
                      aria-label="Compare with"
                      onChange={(e) => void store().compareWith(e.target.value)}
                    >
                      <option value={NOW}>the note now</option>
                      {list
                        .filter((s) => s.id !== selected)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {nameOf(s, now)}
                          </option>
                        ))}
                    </select>
                  ) : null}
                  <div className={styles.spacer} />
                  <div className={styles.segments}>
                    {(["changes", "whole"] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        className={view === v ? styles.segmentOn : styles.segment}
                        aria-pressed={view === v}
                        onClick={() => store().setView(v)}
                      >
                        {v === "changes" ? "Changes" : "Whole snapshot"}
                      </button>
                    ))}
                  </div>
                </div>
                <div className={styles.scroll} data-testid="history-detail">
                  {diff ? (
                    view === "whole" ? (
                      <Whole list={diff} />
                    ) : count > 0 ? (
                      <Changes list={diff} />
                    ) : (
                      <p className={styles.muted}>Nothing differs from {againstName}.</p>
                    )
                  ) : null}
                </div>
              </>
            ) : list.length > 0 ? (
              <p className={styles.muted}>Pick a snapshot to see what has changed since.</p>
            ) : null}

            <div className={styles.foot}>
              <span className={styles.hint}>
                {snapshot
                  ? "Restoring keeps the note as it is now as a snapshot first."
                  : "Snapshots follow the Folio to your other computer."}
              </span>
              <div className={styles.spacer} />
              <button
                type="button"
                className={styles.primary}
                disabled={busy || !snapshot || thenText === undefined || sameAsNow}
                onClick={() => void store().restore()}
                data-testid="history-restore"
              >
                Restore this snapshot
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
