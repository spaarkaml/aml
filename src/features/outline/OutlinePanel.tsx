import { useState } from "react";
import { useEditorStore } from "@/features/editor/store";
import styles from "./OutlinePanel.module.css";
import { useOutlineStore } from "./store";

/** Heading tree of the open note: click to jump, drag to reorder a whole section (WP-2.6). */
export function OutlinePanel() {
  const items = useOutlineStore((s) => s.items);
  const active = useOutlineStore((s) => s.active);
  const jump = useOutlineStore((s) => s.jump);
  const move = useOutlineStore((s) => s.move);
  const path = useEditorStore((s) => s.path);
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  const reset = () => {
    setDragging(null);
    setOver(null);
  };
  const drop = (target: number) => {
    if (dragging !== null) move(dragging, target);
    reset();
  };

  if (!path || items.length === 0)
    return (
      <p className={styles.empty} data-testid="outline-panel">
        {path ? "This note has no headings." : "No note open."}
      </p>
    );

  return (
    <div data-testid="outline-panel">
      <ul className={styles.list} data-testid="outline-list">
        {items.map((it) => (
          <li key={`${it.index}:${it.text}`}>
            <button
              type="button"
              draggable
              className={it.index === active ? styles.rowActive : styles.row}
              style={{ paddingLeft: `${it.depth * 12 + 6}px` }}
              data-testid={`outline-item-${it.index}`}
              data-over={over === it.index ? "" : undefined}
              aria-current={it.index === active ? "true" : undefined}
              title={`Heading ${it.level}`}
              onClick={() => jump(it.index)}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", String(it.index));
                setDragging(it.index);
              }}
              onDragOver={(e) => {
                if (dragging === null) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setOver(it.index);
              }}
              onDrop={(e) => {
                e.preventDefault();
                drop(it.index);
              }}
              onDragEnd={reset}
            >
              <span className={styles.level}>{`H${it.level}`}</span>
              <span className={styles.text}>{it.text || "Untitled"}</span>
            </button>
          </li>
        ))}
        {dragging !== null ? (
          // Only while dragging: somewhere to drop a section that belongs at the end.
          <li>
            <button
              type="button"
              className={styles.tail}
              data-testid="outline-end"
              data-over={over === items.length ? "" : undefined}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setOver(items.length);
              }}
              onDrop={(e) => {
                e.preventDefault();
                drop(items.length);
              }}
            >
              Move to the end
            </button>
          </li>
        ) : null}
      </ul>
    </div>
  );
}
