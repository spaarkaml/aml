import { Icon } from "@/app/icons";
import styles from "./DailyPanel.module.css";
import { dayOfMonth, longDate, todayIso, weekdayShort, weekLabel, weekOf } from "./dates";
import { useDailyStore } from "./store";

/**
 * The calendar strip and today's note, in the tray under the Folio tree (WP-3.10).
 * The list of recent Dailies went: every one of them is a note in the tree above, and the
 * Overview already lists what you were last writing.
 */
export function DailyPanel() {
  const dates = useDailyStore((s) => s.dates);
  const anchor = useDailyStore((s) => s.anchor);
  const open = useDailyStore((s) => s.open);
  const page = useDailyStore((s) => s.page);
  const today = todayIso();
  const has = new Set(dates);
  const week = weekOf(anchor);

  return (
    <div className={styles.panel} data-testid="daily-panel">
      <div className={styles.head}>
        <button
          type="button"
          className={styles.arrow}
          onClick={() => page(-1)}
          aria-label="Previous week"
          data-testid="daily-prev"
        >
          <Icon name="chevronLeft" size={14} />
        </button>
        <span className={styles.label} data-testid="daily-label">
          {weekLabel(anchor, today)}
        </span>
        <button
          type="button"
          className={styles.arrow}
          onClick={() => page(1)}
          aria-label="Next week"
          data-testid="daily-next"
        >
          <Icon name="chevronRight" size={14} />
        </button>
      </div>

      <ul className={styles.week} data-testid="daily-week">
        {week.map((iso) => (
          <li key={iso}>
            <button
              type="button"
              className={iso === today ? styles.dayToday : styles.day}
              data-testid={`day-${iso}`}
              data-has={has.has(iso) ? "" : undefined}
              aria-current={iso === today ? "date" : undefined}
              title={longDate(iso)}
              onClick={() => void open(iso)}
            >
              <span className={styles.weekday}>{weekdayShort(iso)}</span>
              <span className={styles.number}>{dayOfMonth(iso)}</span>
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        className={styles.today}
        onClick={() => void open(today)}
        title={longDate(today)}
        data-testid="daily-today"
      >
        Open today&rsquo;s note
      </button>
    </div>
  );
}
