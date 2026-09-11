import { useState } from "react";
import { useBoundingsStore } from "@/features/boundings/store";
import { dayOfMonth, longDate, todayIso, weekdayShort, weekOf } from "@/features/daily/dates";
import { useDailyStore } from "@/features/daily/store";
import { useFolioStore } from "@/features/folio/store";
import { useLayoutStore } from "@/features/layout/store";
import { useProjectStore } from "@/features/project/store";
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
  const projects = useProjectStore((s) => s.list);
  const enterProject = useProjectStore((s) => s.enter);
  const showBounding = useBoundingsStore((s) => s.show);
  const dates = useDailyStore((s) => s.dates);
  const openDaily = useDailyStore((s) => s.open);
  const recent = useTabsStore((s) => s.current().recents ?? []);
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
            A Project is a folder with a manifest — a book, a thesis — with its own Binder,
            Corkboard and goal. <NewProject />
          </p>
        ) : (
          <ul className={styles.tiles} data-testid="overview-projects">
            {projects.map((p) => (
              <li key={p.path}>
                <button
                  type="button"
                  className={styles.tile}
                  onClick={() => {
                    void enterProject(p.path);
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
        {projects.length > 0 ? <NewProject /> : null}
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

/**
 * Turning a folder into a Project is the whole of "New Project": the manifest joins the
 * files that are already there, and nothing moves (ADR-004).
 */
function NewProject() {
  const create = useProjectStore((s) => s.create);
  const folio = useFolioStore((s) => s.folio);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  if (!folio) return null;
  if (!naming)
    return (
      <button
        type="button"
        className={styles.newProject}
        onClick={() => setNaming(true)}
        data-testid="new-project"
      >
        New Project…
      </button>
    );
  const commit = () => {
    const clean = name.trim().replace(/[/\\]/g, "-");
    setNaming(false);
    setName("");
    if (clean) void create(clean);
  };
  return (
    <input
      // biome-ignore lint/a11y/noAutofocus: the field appears because the user asked for it
      autoFocus
      className={styles.newProjectField}
      value={name}
      placeholder="Name of the Project"
      aria-label="Name of the Project"
      data-testid="new-project-name"
      onChange={(e) => setName(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") {
          setName("");
          setNaming(false);
        }
      }}
    />
  );
}
