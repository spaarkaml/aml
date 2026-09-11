import { useEffect, useState } from "react";
import { todayIso } from "@/features/daily/dates";
import { daysLeft, describePace, fraction, pacePerDay } from "@/features/goals/goals";
import { ProgressRing } from "@/features/goals/ProgressRing";
import { useTabsStore } from "@/features/tabs/store";
import styles from "./Dashboard.module.css";
import { cardColour, groupsOf, statsOf, statusesOf } from "./project";
import { useProjectStore } from "./store";

const figure = (n: number) => n.toLocaleString("en-AU");

/**
 * The Project dashboard (WP-5.8): how big the book is, how much of it is in the compile,
 * where the words are, and — at last — the Project's own goal.
 *
 * WP-3.4 deliberately shipped goals attached to a note, because ADR-011 puts a Project's
 * goal in `project.aml.yaml` and nothing wrote that file yet. It does now, so the deadline
 * arithmetic here is the same arithmetic, against the manifest's target.
 */
export function Dashboard() {
  const project = useProjectStore((s) => s.project);
  const show = useProjectStore((s) => s.show);
  const stats = statsOf(project);
  const groups = groupsOf(project);
  const statuses = statusesOf(project);
  const today = todayIso();

  if (!project) return null;

  const goal = project.target ?? 0;
  const pace =
    goal > 0 && project.deadline
      ? pacePerDay({ target: goal, deadline: project.deadline }, stats.includedWords, today)
      : null;
  const longest = Math.max(1, ...groups.map((g) => g.words));

  return (
    <div className={styles.dashboard} data-testid="project-dashboard">
      <ul className={styles.figures} data-testid="project-figures">
        <Figure label="Words" value={figure(stats.words)} testId="project-words" />
        <Figure
          label="In the compile"
          value={figure(stats.includedWords)}
          testId="project-included"
        />
        <Figure label="Documents" value={figure(stats.documents)} testId="project-documents" />
        <Figure label="Parts" value={figure(stats.parts)} testId="project-parts" />
        {stats.excluded > 0 ? (
          <Figure label="Left out" value={figure(stats.excluded)} testId="project-excluded" />
        ) : null}
      </ul>

      <section className={styles.section}>
        <h3 className={styles.heading}>Goal</h3>
        <Goal />
        {goal > 0 ? (
          <div className={styles.goal} data-testid="project-goal">
            <ProgressRing
              done={stats.includedWords}
              goal={goal}
              size={40}
              label={`${Math.round(fraction(stats.includedWords, goal) * 100)}% of ${figure(goal)} words`}
            />
            <p className={styles.goalText}>
              <span className={styles.figureValue}>
                {figure(stats.includedWords)} of {figure(goal)}
              </span>
              <span className={styles.meta}>
                {describePace(pace) ??
                  (stats.includedWords >= goal
                    ? "Target met."
                    : `${figure(goal - stats.includedWords)} words to go`)}
                {project.deadline
                  ? ` · ${
                      daysLeft(project.deadline, today) === null
                        ? `${project.deadline} has been and gone`
                        : `due ${project.deadline}`
                    }`
                  : ""}
              </span>
            </p>
          </div>
        ) : (
          <p className={styles.meta}>
            No target yet. A Project's goal lives in its manifest, so it follows the book between
            machines.
          </p>
        )}
      </section>

      <section className={styles.section}>
        <h3 className={styles.heading}>Where the words are</h3>
        {groups.length === 0 ? (
          <p className={styles.meta}>Nothing in the Binder yet.</p>
        ) : (
          <ul className={styles.rows} data-testid="project-parts-table">
            {groups.map((g, i) => (
              <li
                key={g.part?.rel ?? `loose-${i}`}
                className={styles.row}
                data-testid={`project-part-${g.part?.rel ?? ""}`}
              >
                <span className={styles.rowName}>
                  {g.part ? (
                    g.part.name
                  ) : (
                    <span className={styles.meta}>Before the first part</span>
                  )}
                </span>
                <span className={styles.bar} aria-hidden="true">
                  <span
                    className={styles.fill}
                    style={{ width: `${(g.words / longest) * 100}%` }}
                  />
                </span>
                <span className={styles.rowValue}>{figure(g.words)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section}>
        <h3 className={styles.heading}>By status</h3>
        {statuses.length === 0 ? (
          <p className={styles.meta}>No documents yet.</p>
        ) : (
          <ul className={styles.statuses} data-testid="project-statuses">
            {statuses.map((s) => (
              <li key={s.status || "none"} data-testid={`project-status-${s.status}`}>
                <span
                  className={styles.dot}
                  style={{ background: cardColour(s.status) ?? undefined }}
                />
                <span className={styles.statusName}>{s.status || "No status"}</span>
                <span className={styles.meta}>
                  {s.documents} {s.documents === 1 ? "document" : "documents"} · {figure(s.words)}{" "}
                  words
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className={styles.actions}>
        <button type="button" onClick={() => show("corkboard")} data-testid="dashboard-corkboard">
          Corkboard
        </button>
        <button
          type="button"
          onClick={() => {
            const first = project.binder.find((i) => i.kind === "note");
            if (first) useTabsStore.getState().open(first.path);
          }}
        >
          Open the first document
        </button>
      </div>
    </div>
  );
}

function Figure({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <li className={styles.figure}>
      <span className={styles.figureValue} data-testid={testId}>
        {value}
      </span>
      <span className={styles.figureLabel}>{label}</span>
    </li>
  );
}

/** Title, target and deadline — the three things the manifest holds that you choose. */
function Goal() {
  const project = useProjectStore((s) => s.project);
  const save = useProjectStore((s) => s.save);
  const [title, setTitle] = useState(project?.title ?? "");
  const [target, setTarget] = useState(project?.target ? String(project.target) : "");
  const [deadline, setDeadline] = useState(project?.deadline ?? "");

  useEffect(() => {
    setTitle(project?.title ?? "");
    setTarget(project?.target ? String(project.target) : "");
    setDeadline(project?.deadline ?? "");
  }, [project?.title, project?.target, project?.deadline]);

  if (!project) return null;

  return (
    <div className={styles.fields}>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Title</span>
        <input
          className={styles.input}
          value={title}
          data-testid="project-title"
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && title !== project.title && void save({ title })}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
      </label>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Target words</span>
        <input
          className={styles.input}
          inputMode="numeric"
          value={target}
          placeholder="none"
          data-testid="project-target"
          onChange={(e) => setTarget(e.target.value.replace(/[^\d]/g, ""))}
          onBlur={() => void save({ target: target ? Number(target) : null })}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
      </label>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Deadline</span>
        <input
          className={styles.input}
          type="date"
          value={deadline}
          data-testid="project-deadline"
          onChange={(e) => setDeadline(e.target.value)}
          onBlur={() => void save({ deadline: deadline || null })}
        />
      </label>
    </div>
  );
}
