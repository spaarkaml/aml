import { useBoundingsStore } from "@/features/boundings/store";
import { dayOfMonth, longDate, todayIso, weekdayShort, weekOf } from "@/features/daily/dates";
import { useDailyStore } from "@/features/daily/store";
import { useBrowserStore } from "@/features/folio/browserStore";
import { useFolioStore } from "@/features/folio/store";
import { useLayoutStore } from "@/features/layout/store";
import { openNoteAt } from "@/features/quickopen/store";
import { useTabsStore } from "@/features/tabs/store";
import { baseName, parentDir } from "@/lib/paths";
import styles from "./Overview.module.css";

const RECENTS = 8;

/**
 * The Overview (ADR-011): where you land when nothing is open. Boundings and Projects as
 * clusters, the week you are in, and what you were last writing.
 */
export function Overview() {
  const folio = useFolioStore((s) => s.folio);
  const boundings = useBoundingsStore((s) => s.list);
  const projects = useBoundingsStore((s) => s.projects);
  const showBounding = useBoundingsStore((s) => s.show);
  const dates = useDailyStore((s) => s.dates);
  const openDaily = useDailyStore((s) => s.open);
  const recent = useTabsStore((s) => s.current().recents ?? []);
  const reveal = useBrowserStore((s) => s.reveal);
  const setLeftView = useLayoutStore((s) => s.setLeftView);
  const openPanel = useLayoutStore((s) => s.openPanel);
  const today = todayIso();
  const week = weekOf(today);
  const has = new Set(dates);

  if (!folio) return null;

  return (
    <div className={styles.overview} data-testid="overview">
      <header className={styles.header}>
        <h1 className={styles.name}>{folio.name}</h1>
        <p className={styles.count}>
          {folio.noteCount.toLocaleString("en-AU")} {folio.noteCount === 1 ? "note" : "notes"}
        </p>
      </header>

      <section className={styles.section}>
        <h2 className={styles.title}>This week</h2>
        <ul className={styles.week} data-testid="overview-week">
          {week.map((iso) => (
            <li key={iso}>
              <button
                type="button"
                className={iso === today ? styles.dayToday : styles.day}
                data-testid={`overview-day-${iso}`}
                data-has={has.has(iso) ? "" : undefined}
                aria-current={iso === today ? "date" : undefined}
                title={longDate(iso)}
                onClick={() => void openDaily(iso)}
              >
                <span className={styles.weekday}>{weekdayShort(iso)}</span>
                <span className={styles.number}>{dayOfMonth(iso)}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.title}>Boundings</h2>
        {boundings.length === 0 ? (
          <p className={styles.empty}>
            No Boundings yet — group your work (creative, academic, work, software) from the
            Boundings panel and it will cluster here.
          </p>
        ) : (
          <ul className={styles.tiles} data-testid="overview-boundings">
            {boundings.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  className={styles.tile}
                  style={{ borderColor: b.colour }}
                  onClick={() => showBounding(b.id)}
                  data-testid={`overview-bounding-${b.id}`}
                >
                  <span className={styles.tileIcon} style={{ background: b.colour }}>
                    {b.icon}
                  </span>
                  <span className={styles.tileName}>{b.name}</span>
                  <span className={styles.tileCount}>
                    {b.notes.length} {b.notes.length === 1 ? "note" : "notes"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.title}>Projects</h2>
        {projects.length === 0 ? (
          <p className={styles.empty}>
            A Project is a folder with a manifest; the Binder and Compile arrive with them in Stage
            5.
          </p>
        ) : (
          <ul className={styles.tiles} data-testid="overview-projects">
            {projects.map((p) => (
              <li key={p.path}>
                <button
                  type="button"
                  className={styles.tile}
                  onClick={() => {
                    reveal(p.path);
                    setLeftView("folio");
                    openPanel("left");
                  }}
                  data-testid={`overview-project-${p.path}`}
                >
                  <span className={styles.tileName}>{p.name}</span>
                  <span className={styles.tileCount}>
                    {p.notes} {p.notes === 1 ? "note" : "notes"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {recent.length > 0 ? (
        <section className={styles.section}>
          <h2 className={styles.title}>Recent</h2>
          <ul className={styles.recent} data-testid="overview-recent">
            {recent.slice(0, RECENTS).map((path) => (
              <li key={path}>
                <button
                  type="button"
                  className={styles.note}
                  onClick={() => openNoteAt(path, null)}
                >
                  <span className={styles.noteName}>{baseName(path).replace(/\.md$/i, "")}</span>
                  <span className={styles.noteFolder}>{parentDir(path) || "/"}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
