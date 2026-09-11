import { todayIso } from "@/features/daily/dates";
import { useEditorStore } from "@/features/editor/store";
import { applyYaml, currentYaml } from "@/features/properties/edit";
import { parseFields, removeField, setField, toYaml } from "@/features/properties/frontmatter";
import { useSettingsStore } from "@/features/settings/store";
import styles from "./GoalsSection.module.css";
import { DEADLINE_KEY, describePace, noteGoal, pacePerDay, TARGET_KEY } from "./goals";
import { ProgressRing } from "./ProgressRing";
import { useGoalsStore } from "./store";

const n = (value: number) => value.toLocaleString("en-AU");

/**
 * Goals (Q18), all three opt-in and each kept where it belongs: today's tally is per device,
 * the daily goal is the Folio's, and a note's target is a property of the note — so it
 * travels with the note, survives being read in any other editor, and is searchable.
 */
export function GoalsSection() {
  const path = useEditorStore((s) => s.path);
  // Re-read the front matter on every document change, the way the Properties panel does.
  useEditorStore((s) => s.doc);
  const words = useEditorStore((s) => s.words);
  const history = useGoalsStore((s) => s.history);
  const streak = useGoalsStore((s) => s.streak);
  const dailyGoal = Number(useSettingsStore((s) => s.dailyGoal)) || 0;
  const openSettings = useSettingsStore((s) => s.setOpen);

  const today = history[todayIso()] ?? 0;
  const fields = path ? parseFields(currentYaml()) : [];
  const goal = noteGoal(fields);
  const pace = goal && path ? describePace(pacePerDay(goal, words, todayIso())) : null;
  const days = streak(dailyGoal);

  const setTarget = (raw: string) => {
    const value = Math.round(Number(raw.trim()));
    applyYaml(
      toYaml(
        raw.trim() && Number.isFinite(value) && value > 0
          ? setField(fields, TARGET_KEY, value)
          : removeField(fields, TARGET_KEY),
      ),
    );
  };

  const setDeadline = (raw: string) => {
    applyYaml(
      toYaml(raw ? setField(fields, DEADLINE_KEY, raw) : removeField(fields, DEADLINE_KEY)),
    );
  };

  return (
    <div className={styles.panel} data-testid="goals-panel">
      <div className={styles.today} data-testid="goals-today">
        {dailyGoal > 0 ? (
          <>
            <ProgressRing
              done={today}
              goal={dailyGoal}
              size={34}
              label={`${n(today)} of ${n(dailyGoal)} words today`}
            />
            <span className={styles.text}>
              <span className={styles.figure} data-testid="goals-today-count">
                {n(today)} of {n(dailyGoal)}
              </span>
              <span className={styles.meta}>
                words today
                {days > 0 ? ` · ${days}-day streak` : ""}
              </span>
            </span>
          </>
        ) : (
          <span className={styles.meta} data-testid="goals-no-daily">
            No daily goal.{" "}
            <button type="button" className={styles.link} onClick={() => openSettings(true)}>
              Set one in Settings
            </button>
            {today !== 0 ? ` — ${n(today)} words written today.` : "."}
          </span>
        )}
      </div>

      {path ? (
        <div className={styles.note} data-testid="goals-note">
          {goal ? (
            <>
              <div className={styles.bar} data-testid="goals-note-bar">
                <span
                  className={styles.fill}
                  style={{ width: `${Math.min(100, (words / goal.target) * 100)}%` }}
                />
              </div>
              <p className={styles.figure} data-testid="goals-note-count">
                {n(words)} of {n(goal.target)} words
              </p>
              {pace ? (
                <p className={styles.meta} data-testid="goals-pace">
                  {pace}
                </p>
              ) : null}
              {goal.deadline && !pace ? (
                <p className={styles.meta} data-testid="goals-pace">
                  {words >= goal.target ? "Done." : `Due ${goal.deadline}.`}
                </p>
              ) : null}
            </>
          ) : null}

          <div className={styles.fieldRow}>
            <label className={styles.label} htmlFor="goal-target">
              Target
            </label>
            <input
              id="goal-target"
              className={styles.input}
              type="number"
              min="0"
              step="100"
              defaultValue={goal?.target ?? ""}
              key={`${path}-target-${goal?.target ?? ""}`}
              placeholder="words"
              aria-label="Target words for this note"
              data-testid="goal-target"
              onBlur={(e) => setTarget(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
            />
          </div>
          {goal ? (
            <div className={styles.fieldRow}>
              <label className={styles.label} htmlFor="goal-deadline">
                By
              </label>
              <input
                id="goal-deadline"
                className={styles.input}
                type="date"
                defaultValue={goal.deadline ?? ""}
                key={`${path}-deadline-${goal.deadline ?? ""}`}
                aria-label="Deadline for this note"
                data-testid="goal-deadline"
                onChange={(e) => setDeadline(e.target.value)}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
