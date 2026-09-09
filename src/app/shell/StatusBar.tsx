import { useEditorStore } from "@/features/editor/store";
import { useSpellStore } from "@/features/spell/store";
import type { AppInfo } from "@/ipc";
import { readingMinutes } from "@/lib/wordcount";
import styles from "./shell.module.css";

export function StatusBar({ info }: { info: AppInfo | null }) {
  const words = useEditorStore((s) => s.words);
  const dirty = useEditorStore((s) => s.dirty);
  const saving = useEditorStore((s) => s.saving);
  const path = useEditorStore((s) => s.path);
  const spell = useSpellStore((s) => s.enabled);
  const toggleSpell = useSpellStore((s) => s.toggle);
  return (
    <footer className={styles.statusbar}>
      <span data-testid="word-count">
        {words.toLocaleString("en-AU")} {words === 1 ? "word" : "words"}
      </span>
      {path ? <span>{readingMinutes(words)} min read</span> : null}
      <button
        type="button"
        className={styles.statusButton}
        onClick={toggleSpell}
        aria-pressed={spell}
        title={
          spell
            ? "Spell check on (en-AU) — click to turn off"
            : "Spell check off — click to turn on"
        }
        data-testid="spell-toggle"
      >
        {spell ? "en-AU ✓" : "en-AU off"}
      </button>
      {path ? (
        <span data-testid="save-state" title={path}>
          {saving ? "Saving…" : dirty ? "● Unsaved" : "Saved"}
        </span>
      ) : null}
      <span className={styles.spacer} />
      {info ? (
        <span data-testid="app-info">
          v{info.version} · {info.platform}/{info.arch}
          {info.debug ? " · debug" : ""}
        </span>
      ) : null}
    </footer>
  );
}
