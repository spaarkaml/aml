import { useEditorStore } from "@/features/editor/store";
import { baseName, noteTitle, parentDir } from "@/lib/paths";
import { useTabsStore } from "./store";
import styles from "./TabStrip.module.css";

/** Tab strip in the top bar: one tab per open note in the current Folio. */
export function TabStrip() {
  const tabs = useTabsStore((s) => (s.folioRoot ? (s.byFolio[s.folioRoot]?.tabs ?? EMPTY) : EMPTY));
  const active = useTabsStore((s) =>
    s.folioRoot ? (s.byFolio[s.folioRoot]?.active ?? null) : null,
  );
  const activate = useTabsStore((s) => s.activate);
  const close = useTabsStore((s) => s.close);
  const dirty = useEditorStore((s) => s.dirty);
  const editorPath = useEditorStore((s) => s.path);

  const titles = new Map<string, number>();
  for (const t of tabs) titles.set(noteTitle(t), (titles.get(noteTitle(t)) ?? 0) + 1);

  return (
    <div className={styles.strip} role="tablist" aria-label="Open notes" data-testid="tab-strip">
      {tabs.map((path) => {
        const title = noteTitle(path);
        const ambiguous = (titles.get(title) ?? 0) > 1;
        const isActive = path === active;
        return (
          // biome-ignore lint/a11y/useSemanticElements: a div with role=tab lets the close control be a real button inside it
          <div
            key={path}
            role="tab"
            tabIndex={isActive ? 0 : -1}
            aria-selected={isActive}
            className={isActive ? styles.tabActive : styles.tab}
            title={path}
            data-path={path}
            onClick={() => activate(path)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") activate(path);
            }}
            onAuxClick={(e) => {
              if (e.button === 1) close(path);
            }}
          >
            <span className={styles.label}>
              {title}
              {ambiguous ? (
                <span className={styles.hint}> · {baseName(parentDir(path)) || "/"}</span>
              ) : null}
            </span>
            {dirty && editorPath === path ? (
              <span className={styles.dot} role="img" aria-label="Unsaved changes">
                ●
              </span>
            ) : null}
            <button
              type="button"
              className={styles.close}
              aria-label={`Close ${title}`}
              onClick={(e) => {
                e.stopPropagation();
                close(path);
              }}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}

const EMPTY: string[] = [];
