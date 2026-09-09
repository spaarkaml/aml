import { useEditorStore } from "@/features/editor/store";
import type { AppInfo } from "@/ipc";
import { readingMinutes } from "@/lib/wordcount";
import styles from "./shell.module.css";

export function StatusBar({ info }: { info: AppInfo | null }) {
  const words = useEditorStore((s) => s.words);
  const dirty = useEditorStore((s) => s.dirty);
  const saving = useEditorStore((s) => s.saving);
  const path = useEditorStore((s) => s.path);
  return (
    <footer className={styles.statusbar}>
      <span data-testid="word-count">
        {words.toLocaleString("en-AU")} {words === 1 ? "word" : "words"}
      </span>
      {path ? <span>{readingMinutes(words)} min read</span> : null}
      <span>en-AU</span>
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
