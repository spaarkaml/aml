import { fraction } from "./goals";
import styles from "./ProgressRing.module.css";

interface Props {
  done: number;
  goal: number;
  size?: number;
  label?: string;
}

/**
 * The goal ring (ADR-013's accent is for exactly this). Drawn rather than filled so it sits
 * happily at 12px in the status bar and at 40px in the panel, and stroked in `currentColor`'s
 * sibling token so Ink needs nothing of its own.
 */
export function ProgressRing({ done, goal, size = 14, label }: Props) {
  const done01 = fraction(done, goal);
  const r = 7;
  const circumference = 2 * Math.PI * r;
  return (
    <svg
      className={styles.ring}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      role={label ? "img" : "presentation"}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-full={done01 >= 1 ? "" : undefined}
    >
      <circle className={styles.track} cx="8" cy="8" r={r} />
      <circle
        className={styles.progress}
        cx="8"
        cy="8"
        r={r}
        strokeDasharray={`${circumference * done01} ${circumference}`}
      />
    </svg>
  );
}
