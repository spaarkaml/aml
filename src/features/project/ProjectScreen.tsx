import { useEffect, useRef } from "react";
import { Icon } from "@/app/icons";
import { useEditorStore } from "@/features/editor/store";
import { Corkboard } from "./Corkboard";
import { Dashboard } from "./Dashboard";
import styles from "./ProjectScreen.module.css";
import { type ProjectScreen as Screen, useProjectStore } from "./store";

const TABS: Array<{ id: Exclude<Screen, null>; label: string }> = [
  { id: "dashboard", label: "Dashboard" },
  { id: "corkboard", label: "Corkboard" },
];

/**
 * The Project in the page: its dashboard (WP-5.8) and its Corkboard (WP-5.3), with the
 * Binder still in the Browser beside them. It takes the page rather than a dialog because
 * the board wants every pixel of width it can get, and because it is a place you work.
 */
export function ProjectScreen() {
  const project = useProjectStore((s) => s.project);
  const screen = useProjectStore((s) => s.screen);
  const show = useProjectStore((s) => s.show);
  const path = useEditorStore((s) => s.path);

  // Opening a note is how you leave: clicking a card, a Binder row or a tab puts you in the
  // editor, and the screen should not still be in front of it. Only a *change* of note does
  // that — the screen opens over whatever was already there.
  const was = useRef(path);
  useEffect(() => {
    if (path !== was.current) {
      was.current = path;
      show(null);
    }
  }, [path, show]);

  if (!project || !screen) return null;

  return (
    <div className={styles.screen} data-testid="project-screen">
      <header className={styles.head}>
        <h1 className={styles.title}>
          <Icon name="book" size={20} />
          {project.title}
        </h1>
        <div className={styles.tabs}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={screen === t.id}
              className={screen === t.id ? styles.tabActive : styles.tab}
              onClick={() => show(t.id)}
              data-testid={`project-tab-${t.id}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={styles.close}
          onClick={() => show(null)}
          aria-label="Close the Project screen"
          data-testid="project-close"
        >
          <Icon name="close" size={14} />
        </button>
      </header>
      {screen === "dashboard" ? <Dashboard /> : <Corkboard />}
    </div>
  );
}
