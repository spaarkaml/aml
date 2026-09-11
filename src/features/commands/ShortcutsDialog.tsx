import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Icon } from "@/app/icons";
import { fuzzyFilter } from "@/lib/fuzzy";
import { conflictOf, shortcutFromEvent } from "./keymap";
import { useKeymapStore } from "./keymapStore";
import { type Command, commandRegistry, formatShortcut } from "./registry";
import styles from "./ShortcutsDialog.module.css";

const subscribe = (fn: () => void) => commandRegistry.subscribe(fn);
const getSnapshot = () => commandRegistry.list();

/** Keys Tiptap owns inside the editor; listed so they are at least discoverable. */
const EDITOR_KEYS: Array<[string, string]> = [
  ["Bold", "mod+b"],
  ["Italic", "mod+i"],
  ["Inline code", "mod+e"],
  ["Undo", "mod+z"],
  ["Redo", "mod+shift+z"],
];

export function ShortcutsDialog() {
  const open = useKeymapStore((s) => s.open);
  const setOpen = useKeymapStore((s) => s.setOpen);
  const recording = useKeymapStore((s) => s.recording);
  const error = useKeymapStore((s) => s.error);
  const record = useKeymapStore((s) => s.record);
  const fail = useKeymapStore((s) => s.fail);
  const bind = useKeymapStore((s) => s.bind);
  const reset = useKeymapStore((s) => s.reset);
  const resetAll = useKeymapStore((s) => s.resetAll);
  const all = useSyncExternalStore(subscribe, getSnapshot);
  const [query, setQuery] = useState("");

  const rows = useMemo(
    () => fuzzyFilter(query, all, (c) => `${c.group ? `${c.group}: ` : ""}${c.title}`),
    [query, all],
  );

  // While recording, the next key press is the new shortcut rather than a command.
  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") return record(null);
      if (e.key === "Backspace" || e.key === "Delete") return bind(recording, null);
      const result = shortcutFromEvent(e);
      if ("error" in result) {
        if (result.error === "needsModifier") fail("That key needs a modifier — try ⌘ or ⌥.");
        return;
      }
      const clash = conflictOf(
        all,
        (c) => commandRegistry.shortcutOf(c),
        recording,
        result.shortcut,
      );
      if (clash) {
        fail(`${formatShortcut(result.shortcut)} already runs "${clash.title}".`);
        return;
      }
      bind(recording, result.shortcut);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recording, all, bind, record, fail]);

  if (!open) return null;

  return (
    <div className={styles.backdrop} data-testid="shortcuts-backdrop">
      <button
        type="button"
        className={styles.backdropButton}
        onMouseDown={() => setOpen(false)}
        tabIndex={-1}
        aria-label="Close keyboard shortcuts"
      />
      <div className={styles.panel} role="dialog" aria-label="Keyboard shortcuts">
        <div className={styles.head}>
          <h2 className={styles.title}>Keyboard shortcuts</h2>
          <button type="button" className={styles.small} onClick={resetAll}>
            Reset all
          </button>
          <button
            type="button"
            className={styles.small}
            onClick={() => setOpen(false)}
            data-testid="shortcuts-close"
          >
            Done
          </button>
        </div>

        <input
          className={styles.search}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter commands…"
          aria-label="Filter commands"
          data-testid="shortcuts-filter"
        />
        {error ? (
          <p className={styles.error} role="alert" data-testid="shortcuts-error">
            {error}
          </p>
        ) : null}

        <ul className={styles.list} data-testid="shortcuts-list">
          {rows.map((c: Command) => {
            const shortcut = commandRegistry.shortcutOf(c);
            return (
              <li key={c.id} className={styles.row} data-testid={`shortcut-row-${c.id}`}>
                <span className={styles.label}>
                  {c.group ? <span className={styles.group}>{c.group}</span> : null}
                  {c.title}
                </span>
                <button
                  type="button"
                  className={recording === c.id ? styles.recording : styles.key}
                  onClick={() => record(recording === c.id ? null : c.id)}
                  data-testid={`shortcut-key-${c.id}`}
                  title={
                    recording === c.id
                      ? "Press the keys; Escape cancels, Backspace unbinds"
                      : "Click, then press the keys you want"
                  }
                >
                  {recording === c.id ? "Press keys…" : shortcut ? formatShortcut(shortcut) : "—"}
                </button>
                <button
                  type="button"
                  className={styles.reset}
                  onClick={() => reset(c.id)}
                  disabled={!commandRegistry.isRebound(c.id)}
                  aria-label={`Reset ${c.title}`}
                  data-testid={`shortcut-reset-${c.id}`}
                >
                  <Icon name="revert" size={13} />
                </button>
              </li>
            );
          })}
        </ul>

        <details className={styles.editorKeys}>
          <summary className={styles.editorSummary}>Editor keys</summary>
          <p className={styles.note}>
            These belong to the editor itself and are the same on every machine; they are not
            rebindable yet.
          </p>
          <ul className={styles.list}>
            {EDITOR_KEYS.map(([name, key]) => (
              <li key={name} className={styles.row}>
                <span className={styles.label}>{name}</span>
                <span className={styles.fixedKey}>{formatShortcut(key)}</span>
              </li>
            ))}
          </ul>
        </details>
      </div>
    </div>
  );
}
