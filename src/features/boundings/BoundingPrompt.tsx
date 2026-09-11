import { useState } from "react";
import { Icon } from "@/app/icons";
import { useEditorStore } from "@/features/editor/store";
import styles from "./BoundingPrompt.module.css";
import { useBoundingsStore } from "./store";

/**
 * A note that belongs to no Bounding is a note you will not find again by any route except
 * remembering where you put it. This asks, once, at the top of the page — and only when there
 * is something to answer with: no Boundings yet means no prompt, because a question with no
 * answers is just noise.
 */
export function BoundingPrompt() {
  const path = useEditorStore((s) => s.path);
  const boundings = useBoundingsStore((s) => s.list);
  const add = useBoundingsStore((s) => s.add);
  const show = useBoundingsStore((s) => s.show);
  // Dismissing holds the note it applies to, so opening another one asks again by itself.
  const [dismissed, setDismissed] = useState<string | null>(null);

  if (!path || boundings.length === 0) return null;
  if (dismissed === path) return null;
  if (boundings.some((b) => b.notes.includes(path))) return null;

  return (
    <section
      className={styles.bar}
      aria-label="Add this note to a Bounding"
      data-testid="bounding-prompt"
    >
      <span className={styles.label}>Add to</span>
      <ul className={styles.chips}>
        {boundings.map((b) => (
          <li key={b.id}>
            <button
              type="button"
              className={styles.chip}
              style={{ "--chip": b.colour } as React.CSSProperties}
              onClick={() => void add(b.id)}
              title={`Add this note to ${b.name}`}
              data-testid={`bounding-prompt-${b.id}`}
            >
              <span className={styles.swatch} aria-hidden="true">
                {b.icon}
              </span>
              {b.name}
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className={styles.more}
        onClick={() => show()}
        title="Manage Boundings"
        aria-label="Manage Boundings"
      >
        <Icon name="plus" size={14} />
      </button>
      <button
        type="button"
        className={styles.close}
        onClick={() => setDismissed(path)}
        title="Not now"
        aria-label="Dismiss"
      >
        <Icon name="close" size={13} />
      </button>
    </section>
  );
}
