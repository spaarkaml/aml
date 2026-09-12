import type { ReactNode } from "react";
import { type Side, useLayoutStore } from "@/features/layout/store";
import { Icon } from "../icons";
import styles from "./shell.module.css";

interface Props {
  side: Side;
  title: string;
  children?: ReactNode;
}

/**
 * A side panel: a floating card inset from the window, pinned or not.
 *
 * Pinning does not change how it is drawn — both states are the same card, because a panel
 * that redraws itself when you pin it makes you re-find everything in it. What pinning
 * changes is what happens next: a pinned panel stays and the page makes room for it (`Shell`
 * sets the margin), while an unpinned one floats over the page and closes behind you.
 */
export function SidePanel({ side, title, children }: Props) {
  const panel = useLayoutStore((s) => s[side]);
  const togglePinned = useLayoutStore((s) => s.togglePinned);
  const togglePanel = useLayoutStore((s) => s.togglePanel);
  const setWidth = useLayoutStore((s) => s.setWidth);

  if (!panel.open) return null;

  const startResize = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = panel.width;
    const onMove = (ev: PointerEvent) => {
      const delta = side === "left" ? ev.clientX - startX : startX - ev.clientX;
      setWidth(side, startWidth + delta);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <aside
      className={styles.panelFloat}
      style={{ width: panel.width }}
      data-side={side}
      data-pinned={panel.pinned}
      data-testid={`panel-${side}`}
      aria-label={title}
    >
      <div className={styles.panelHeader}>
        <span>{title}</span>
        <span className={styles.actions}>
          <button
            type="button"
            className={styles.iconButton}
            aria-pressed={panel.pinned}
            onClick={() => togglePinned(side)}
            title={
              panel.pinned
                ? "Unpin — the panel floats over the page and closes behind you"
                : "Pin — the panel stays open and the page makes room for it"
            }
          >
            {panel.pinned ? "Pinned" : "Pin"}
          </button>
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => togglePanel(side)}
            title="Close"
            aria-label={`Close ${title}`}
          >
            <Icon name="close" />
          </button>
        </span>
      </div>
      <div className={styles.panelBody}>{children}</div>
      <div className={styles.resizer} data-side={side} onPointerDown={startResize} />
    </aside>
  );
}
