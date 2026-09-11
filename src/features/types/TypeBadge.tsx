import type { NoteType } from "@/ipc";
import styles from "./TypeBadge.module.css";

interface Props {
  type: NoteType | null;
  /** With the type's name beside the mark, for panels rather than dense lists. */
  withName?: boolean;
  className?: string | undefined;
}

/**
 * What a note is, in as little space as it takes: the type's emoji if it has one, otherwise
 * a dot in its colour. Nothing at all for a note with no type — an untyped note is the
 * ordinary case and should not carry a badge saying so.
 */
export function TypeBadge({ type, withName = false, className }: Props) {
  if (!type) return null;
  return (
    <span
      className={className ? `${styles.badge} ${className}` : styles.badge}
      style={{ "--type": type.colour } as React.CSSProperties}
      title={withName ? undefined : type.name}
      data-testid={`type-badge-${type.id}`}
    >
      {type.icon ? (
        <span className={styles.icon} aria-hidden="true">
          {type.icon}
        </span>
      ) : (
        <span className={styles.dot} aria-hidden="true" />
      )}
      {withName ? <span className={styles.name}>{type.name}</span> : null}
    </span>
  );
}
