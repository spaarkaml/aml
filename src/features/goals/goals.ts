import type { Field } from "@/features/properties/frontmatter";

/**
 * Goal arithmetic (Q18), kept apart from the stores so every number on screen has a test.
 *
 * All three kinds are opt-in and all three are the user's own data: a note's goal is a
 * property of the note (`target_words`, `deadline`), the daily goal is a Folio setting, and
 * what you have written today is per-device — it is a fact about this keyboard, not about
 * the work, so ADR-004 keeps it out of the Folio.
 */

/** Front-matter keys a note's goal is written as. They are ordinary properties. */
export const TARGET_KEY = "target_words";
export const DEADLINE_KEY = "deadline";

export interface NoteGoal {
  target: number;
  /** `YYYY-MM-DD`, or null when the note is not due by any particular day. */
  deadline: string | null;
}

/** A note's goal, from its own front matter. Null when it has not got one. */
export function noteGoal(fields: Field[]): NoteGoal | null {
  const raw = fields.find((f) => f.key === TARGET_KEY)?.value;
  const target = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
  if (!Number.isFinite(target) || target <= 0) return null;
  const by = fields.find((f) => f.key === DEADLINE_KEY)?.value;
  const deadline =
    typeof by === "string" && /^\d{4}-\d{2}-\d{2}$/.test(by.trim()) ? by.trim() : null;
  return { target: Math.round(target), deadline };
}

/** 0…1. A goal that has been passed reads as full rather than as more than full. */
export function fraction(done: number, goal: number): number {
  if (goal <= 0) return 0;
  return Math.max(0, Math.min(1, done / goal));
}

/**
 * Days from `today` to `deadline`, counting today as one: a deadline of today leaves you
 * one day, not none. Null when the day has passed.
 */
export function daysLeft(deadline: string, today: string): number | null {
  const end = Date.parse(`${deadline}T00:00:00Z`);
  const now = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(end) || Number.isNaN(now)) return null;
  const days = Math.round((end - now) / 86_400_000) + 1;
  return days > 0 ? days : null;
}

/**
 * Words a day to finish on time — Q18's "words remaining ÷ days". Null when there is no
 * deadline, when the work is done, or when the day has been and gone: a number that says
 * "write 4,000 words a day" for a deadline in the past is not information.
 */
export function pacePerDay(
  goal: NoteGoal,
  words: number,
  today: string,
): { perDay: number; days: number } | null {
  if (!goal.deadline) return null;
  const remaining = goal.target - words;
  if (remaining <= 0) return null;
  const days = daysLeft(goal.deadline, today);
  if (days === null) return null;
  return { perDay: Math.ceil(remaining / days), days };
}

/**
 * Consecutive days meeting `goal`, ending today. Today is not counted against you until it
 * is over, so a streak survives the morning: an unmet today is skipped rather than breaking
 * it, and a met today extends it.
 */
export function streakOf(history: Record<string, number>, goal: number, today: string): number {
  if (goal <= 0) return 0;
  let day = today;
  let streak = 0;
  if ((history[today] ?? 0) < goal) day = previousDay(today);
  while ((history[day] ?? 0) >= goal) {
    streak += 1;
    day = previousDay(day);
  }
  return streak;
}

function previousDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** "500 words a day for 8 days" / "1,200 words to go". */
export function describePace(pace: { perDay: number; days: number } | null): string | null {
  if (!pace) return null;
  const words = pace.perDay.toLocaleString("en-AU");
  return pace.days === 1
    ? `${words} words to finish today`
    : `${words} words a day for ${pace.days} days`;
}
