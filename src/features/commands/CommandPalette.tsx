import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { fuzzyFilter } from "@/lib/fuzzy";
import styles from "./CommandPalette.module.css";
import { usePaletteStore } from "./paletteStore";
import { type Command, commandRegistry, formatShortcut } from "./registry";

const subscribe = (fn: () => void) => commandRegistry.subscribe(fn);
const getSnapshot = () => commandRegistry.list();

function useCommands(): Command[] {
  return useSyncExternalStore(subscribe, getSnapshot);
}

const label = (c: Command) => `${c.group ? `${c.group}: ` : ""}${c.title}`;

export function CommandPalette() {
  const open = usePaletteStore((s) => s.open);
  const setOpen = usePaletteStore((s) => s.setOpen);
  const all = useCommands();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => fuzzyFilter(query, all, label), [query, all]);

  // Reset on close, never on open: an effect that clears the query after the palette has
  // rendered can land after the first keystrokes and wipe them.
  useEffect(() => {
    if (!open) {
      setQuery("");
      setIndex(0);
      return;
    }
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    setIndex((i) => Math.min(i, Math.max(0, results.length - 1)));
  }, [results.length]);

  if (!open) return null;

  const runAt = (i: number, list: Command[] = results) => {
    const cmd = list[i];
    setOpen(false);
    // Run after React has unmounted the palette so a command that focuses the editor
    // is not immediately blurred by the input going away.
    if (cmd) setTimeout(() => cmd.run(), 0);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      // Act on what the field actually holds. Enter can arrive before React has rendered the
      // last keystroke, and the palette must never run a command the user was not looking at.
      const typed = e.currentTarget.value;
      if (typed === query) runAt(index);
      else runAt(0, fuzzyFilter(typed, all, label));
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div className={styles.backdrop} data-testid="palette-backdrop">
      <button
        type="button"
        className={styles.backdropButton}
        onMouseDown={() => setOpen(false)}
        tabIndex={-1}
        aria-label="Close command palette"
      />
      <div className={styles.panel} role="dialog" aria-label="Command palette">
        <input
          ref={inputRef}
          className={styles.input}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            // Back to the top match on every keystroke: the pointer may have left the
            // selection on a row that the new query does not even list.
            setIndex(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Type a command…"
          aria-label="Search commands"
          data-testid="palette-input"
        />
        <div className={styles.list} role="listbox" aria-label="Commands">
          {results.length === 0 ? (
            <div className={styles.empty}>No matching commands</div>
          ) : (
            results.map((c, i) => (
              <div
                key={c.id}
                role="option"
                tabIndex={-1}
                aria-selected={i === index}
                className={i === index ? styles.itemActive : styles.item}
                onMouseEnter={() => setIndex(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  runAt(i);
                }}
              >
                <span>
                  {c.group ? <span className={styles.group}>{c.group}</span> : null}
                  {c.title}
                </span>
                {commandRegistry.shortcutOf(c) ? (
                  <kbd className={styles.kbd}>
                    {formatShortcut(commandRegistry.shortcutOf(c) as string)}
                  </kbd>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
