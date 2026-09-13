import { useEffect } from "react";
import { Icon } from "@/app/icons";
import { useSyncStore } from "@/features/sync/store";
import type { Conflict } from "@/ipc";
import { noteTitle } from "@/lib/paths";
import styles from "./ConflictsScreen.module.css";
import { type Choice, changes, type Hunk, type Segment, words } from "./merge";
import { useConflictsStore } from "./store";

const SETTINGS_NAMES: Record<string, string> = {
  ".aml/boundings.yaml": "Boundings",
  ".aml/types.yaml": "Note Types",
  ".aml/config.yaml": "Folio settings",
};

export function titleOf(c: Conflict): string {
  const named = SETTINGS_NAMES[c.original];
  if (named) return named;
  const parts = c.original.split("/");
  const name = parts[parts.length - 1] ?? c.original;
  if (name === "project.aml.yaml") return `Project order · ${parts[parts.length - 2] ?? ""}`;
  return c.kind === "note" ? noteTitle(c.original) : name;
}

function folderOf(path: string): string {
  return path
    .split("/")
    .slice(0, -1)
    .filter((p) => p !== ".aml")
    .join(" / ");
}

/** `2026-09-13 10:11:12` → `13 Sept, 10:11 am`. */
export function whenOf(stamp: string): string {
  const at = new Date(stamp.replace(" ", "T"));
  if (Number.isNaN(at.getTime())) return stamp;
  return at.toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function keyed<T extends object>(list: T[]): (T & { id: string })[] {
  return list.map((item, i) => ({ ...item, id: String(i) }));
}

/** One side of a difference, with the words only this side has marked. */
function Side({
  mine,
  other,
  side,
}: {
  mine: string[];
  other: string[];
  side: "original" | "copy";
}) {
  const rows = keyed(
    mine
      .map((line, i) => ({ line, pair: other[i] }))
      .filter(({ line }) => line.trim() !== "")
      .map(({ line, pair }) => {
        const segments: Segment[] =
          pair !== undefined && pair.trim() !== ""
            ? side === "original"
              ? words(line, pair).original
              : words(pair, line).copy
            : [{ text: line, kind: side === "original" ? "removed" : "added" }];
        return { segments: keyed(segments) };
      }),
  );
  if (rows.length === 0) return <span className={styles.nothing}>Nothing here</span>;
  return (
    <>
      {rows.map((row) => (
        <span key={row.id} className={styles.line}>
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
        </span>
      ))}
    </>
  );
}

/** What both sides share, shortened to the lines either side of a difference. */
function Context({ lines, before, after }: { lines: string[]; before: boolean; after: boolean }) {
  const text = lines.filter((l) => l.trim() !== "");
  if (text.length === 0) return null;
  const long = text.length > 5;
  const head = long ? (before ? text.slice(0, 2) : []) : text;
  const tail = long && after ? text.slice(-2) : [];
  const hidden = long ? text.length - head.length - tail.length : 0;
  return (
    <div className={styles.context}>
      {keyed(head.map((t) => ({ t }))).map((l) => (
        <span key={`h${l.id}`} className={styles.contextLine}>
          {l.t}
        </span>
      ))}
      {hidden > 0 ? (
        <span className={styles.gap}>
          {hidden} unchanged {hidden === 1 ? "paragraph" : "paragraphs"}
        </span>
      ) : null}
      {keyed(tail.map((t) => ({ t }))).map((l) => (
        <span key={`t${l.id}`} className={styles.contextLine}>
          {l.t}
        </span>
      ))}
    </div>
  );
}

interface Labels {
  original: string;
  copy: string;
}

function ChangeRow({
  hunk,
  choice,
  labels,
}: {
  hunk: Extract<Hunk, { kind: "change" }>;
  choice: Choice;
  labels: Labels;
}) {
  const pick = (c: Choice) => useConflictsStore.getState().choose(hunk.id, c);
  const takesOriginal = choice === "original" || choice === "both";
  const takesCopy = choice === "copy" || choice === "both";
  return (
    <div className={styles.change} data-testid="conflict-change">
      <button
        type="button"
        className={takesOriginal ? styles.sideOn : styles.side}
        aria-pressed={takesOriginal}
        onClick={() => pick("original")}
        data-testid="conflict-take-original"
      >
        <Side mine={hunk.original} other={hunk.copy} side="original" />
      </button>
      <button
        type="button"
        className={takesCopy ? styles.sideOn : styles.side}
        aria-pressed={takesCopy}
        onClick={() => pick("copy")}
        data-testid="conflict-take-copy"
      >
        <Side mine={hunk.copy} other={hunk.original} side="copy" />
      </button>
      <div className={styles.picker}>
        {(["original", "copy", "both"] as Choice[]).map((c) => (
          <button
            key={c}
            type="button"
            className={choice === c ? styles.segmentActive : styles.segment}
            aria-pressed={choice === c}
            onClick={() => pick(c)}
          >
            {c === "original" ? labels.original : c === "copy" ? labels.copy : "Both"}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Conflicts (WP-4.2): two versions of one file, and a decision about which to keep.
 *
 * Nothing on this screen is ever chosen for you in a way that loses text you have not looked
 * at, and whatever you do not keep goes to the Trash rather than away.
 */
export function ConflictsScreen() {
  const open = useConflictsStore((s) => s.open);
  const list = useConflictsStore((s) => s.list);
  const source = useConflictsStore((s) => s.source);
  const original = useConflictsStore((s) => s.original);
  const copy = useConflictsStore((s) => s.copy);
  const allHunks = useConflictsStore((s) => s.hunks);
  const choices = useConflictsStore((s) => s.choices);
  const fallback = useConflictsStore((s) => s.fallback);
  const busy = useConflictsStore((s) => s.busy);
  const error = useConflictsStore((s) => s.error);
  const notice = useConflictsStore((s) => s.notice);
  const setOpen = useConflictsStore((s) => s.setOpen);
  const select = useConflictsStore((s) => s.select);
  const back = useConflictsStore((s) => s.back);
  const chooseAll = useConflictsStore((s) => s.chooseAll);
  const resolve = useConflictsStore((s) => s.resolve);
  const myShort = useSyncStore((s) => s.status?.myId?.slice(0, 7) ?? null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const s = useConflictsStore.getState();
      if (s.source?.kind === "file") s.back();
      else s.setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  const file = source?.kind === "file" ? source.conflict : null;
  const editor = source?.kind === "editor";
  const labels: Labels = editor
    ? { original: "On disk", copy: "Your edits" }
    : { original: "In place", copy: "Set aside" };
  const count = changes(allHunks).length;
  const comparable = original !== null && copy !== null && (!file || file.originalExists);
  const who = file
    ? file.device === myShort
      ? "written on this computer"
      : "written on another computer"
    : "";
  const run = (how: "keepOriginal" | "keepCopy" | "merge" | "keepBoth") => void resolve(how);
  const rows = allHunks.map((h, i) => ({
    h,
    id: h.kind === "change" ? `c${h.id}` : `s${i}`,
    before: allHunks[i - 1]?.kind === "change",
    after: allHunks[i + 1]?.kind === "change",
  }));
  const keepBothLabel = file?.kind === "note" ? "Keep both as separate notes" : "Keep both files";

  return (
    <div className={styles.backdrop} data-testid="conflicts-screen">
      <button
        type="button"
        className={styles.backdropButton}
        onMouseDown={() => setOpen(false)}
        tabIndex={-1}
        aria-label="Close conflicts"
      />
      <div className={styles.panel} role="dialog" aria-label="Conflicts">
        <div className={styles.head}>
          {file ? (
            <button type="button" className={styles.ghost} onClick={back}>
              All conflicts
            </button>
          ) : null}
          <h2>{editor ? "Your edits and the file on disk" : file ? titleOf(file) : "Conflicts"}</h2>
          <div className={styles.spacer} />
          <button
            type="button"
            className={styles.close}
            onClick={() => setOpen(false)}
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
        {notice ? (
          <p className={styles.notice} role="status">
            {notice}
          </p>
        ) : null}

        {!source ? (
          list.length === 0 ? (
            <div className={styles.empty} data-testid="conflicts-empty">
              <p>
                <strong>No conflicts.</strong>
              </p>
              <p>
                When the same note is changed on two computers before they have synced, Syncthing
                keeps the newer edit and sets the older one aside. Those show up here, so you can
                decide what to keep.
              </p>
            </div>
          ) : (
            <div className={styles.listWrap}>
              <p className={styles.intro}>
                Each of these was changed on two computers before they had synced. The newer edit is
                in place and the older one was set aside, so nothing has been lost yet.
              </p>
              <ul className={styles.list} data-testid="conflicts-list">
                {list.map((c) => (
                  <li key={c.path}>
                    <button
                      type="button"
                      className={styles.item}
                      onClick={() => void select(c)}
                      disabled={busy}
                    >
                      <span className={styles.itemTitle}>{titleOf(c)}</span>
                      <span className={styles.itemMeta}>
                        {[
                          folderOf(c.original),
                          `set aside ${whenOf(c.stamp)}`,
                          c.originalExists ? null : "original gone",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )
        ) : (
          <>
            <p className={styles.summary} data-testid="conflict-summary">
              {editor
                ? "This note changed on disk while you had unsaved edits. Choose what to keep at each difference."
                : file && !file.originalExists
                  ? `The original was deleted or renamed on another computer. The copy set aside ${whenOf(file.stamp)} is all that is left of it.`
                  : file
                    ? `Two computers changed this before they had synced. The newer edit is in place; the older one was set aside ${whenOf(file.stamp)}, ${who}.`
                    : null}
            </p>

            {comparable && count > 0 ? (
              <>
                <div className={styles.bulk}>
                  <span>
                    {count} {count === 1 ? "difference" : "differences"} · take every one from
                  </span>
                  {(["original", "copy", "both"] as Choice[]).map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={styles.link}
                      onClick={() => chooseAll(c)}
                      aria-pressed={Object.keys(choices).length === 0 && fallback === c}
                    >
                      {c === "original" ? labels.original : c === "copy" ? labels.copy : "Both"}
                    </button>
                  ))}
                </div>
                <div className={styles.columns}>
                  <span>{editor ? "On disk now" : "In place now"}</span>
                  <span>{editor ? "Your unsaved edits" : `Set aside · ${who}`}</span>
                </div>
                <div className={styles.compare} data-testid="conflict-compare">
                  {rows.map(({ h, id, before, after }) =>
                    h.kind === "same" ? (
                      <Context key={id} lines={h.lines} before={before} after={after} />
                    ) : (
                      <ChangeRow
                        key={id}
                        hunk={h}
                        choice={choices[h.id] ?? fallback}
                        labels={labels}
                      />
                    ),
                  )}
                </div>
              </>
            ) : comparable ? (
              <p className={styles.muted}>
                The two versions are identical, so there is nothing to choose.
              </p>
            ) : file?.originalExists ? (
              <p className={styles.muted}>
                This file is not text, so it cannot be compared line by line. Keep one version or
                the other{file.kind === "settings" ? "" : ", or both"}.
              </p>
            ) : null}

            <div className={styles.foot}>
              <span className={styles.hint}>
                {editor
                  ? "Whatever you do not keep of your edits is gone."
                  : "Whatever you do not keep goes to the Trash."}
              </span>
              <div className={styles.spacer} />
              {editor ? (
                <>
                  <button
                    type="button"
                    className={styles.ghost}
                    disabled={busy}
                    onClick={() => run("keepOriginal")}
                  >
                    Keep what is on disk
                  </button>
                  <button
                    type="button"
                    className={styles.ghost}
                    disabled={busy}
                    onClick={() => run("keepCopy")}
                  >
                    Keep my edits
                  </button>
                  <button
                    type="button"
                    className={styles.primary}
                    disabled={busy}
                    onClick={() => run("merge")}
                    data-testid="conflict-save"
                  >
                    Save my choices
                  </button>
                </>
              ) : file && !file.originalExists ? (
                <>
                  <button
                    type="button"
                    className={styles.ghost}
                    disabled={busy}
                    onClick={() => run("keepOriginal")}
                  >
                    Discard the copy
                  </button>
                  <button
                    type="button"
                    className={styles.primary}
                    disabled={busy}
                    onClick={() => run("keepCopy")}
                  >
                    Restore it
                  </button>
                </>
              ) : file && comparable && count === 0 ? (
                <button
                  type="button"
                  className={styles.primary}
                  disabled={busy}
                  onClick={() => run("keepOriginal")}
                >
                  Discard the copy
                </button>
              ) : file ? (
                <>
                  <button
                    type="button"
                    className={styles.ghost}
                    disabled={busy}
                    onClick={() => run("keepOriginal")}
                  >
                    Keep in place
                  </button>
                  <button
                    type="button"
                    className={styles.ghost}
                    disabled={busy}
                    onClick={() => run("keepCopy")}
                  >
                    Use the set-aside copy
                  </button>
                  {file.kind === "settings" ? null : (
                    <button
                      type="button"
                      className={styles.ghost}
                      disabled={busy}
                      onClick={() => run("keepBoth")}
                    >
                      {keepBothLabel}
                    </button>
                  )}
                  {comparable ? (
                    <button
                      type="button"
                      className={styles.primary}
                      disabled={busy}
                      onClick={() => run("merge")}
                      data-testid="conflict-save"
                    >
                      Save my choices
                    </button>
                  ) : null}
                </>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
