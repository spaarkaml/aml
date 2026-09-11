import { Icon } from "@/app/icons";
import { useEditorStore } from "@/features/editor/store";
import styles from "./DailyPanel.module.css";
import { dayOfMonth, longDate, todayIso, weekdayShort, weekLabel, weekOf } from "./dates";
import { useDailyStore } from "./store";

const RECENT = 10;

/** The calendar strip: a week of Daily notes, and the ones you wrote most recently (WP-2.7). */
export function DailyPanel() {
  const dates = useDailyStore((s) => s.dates);
  const anchor = useDailyStore((s) => s.anchor);
  const open = useDailyStore((s) => s.open);
  const page = useDailyStore((s) => s.page);
  const openPath = useEditorStore((s) => s.path);
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
        data-testid="daily-today"
      >
        {has.has(today) ? "Open today" : "Start today"}
      </button>

      {dates.length > 0 ? (
        <>
          <p className={styles.title}>Recent</p>
          <ul className={styles.list} data-testid="daily-recent">
            {dates.slice(0, RECENT).map((iso) => (
              <li key={iso}>
                <button
                  type="button"
                  className={styles.entry}
                  onClick={() => void open(iso)}
                  aria-current={openPath?.endsWith(`${iso}.md`) ? "true" : undefined}
                >
                  {longDate(iso)}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className={styles.empty}>No Daily notes yet.</p>
      )}
    </div>
  );
}
