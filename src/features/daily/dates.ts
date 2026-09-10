/**
 * Local civil dates as `YYYY-MM-DD` strings. The device decides what "today" is; Rust does
 * the calendar arithmetic for templates. These helpers only exist so the calendar strip can
 * lay out a week without a date library — and they never touch UTC, because a Daily note is
 * named after the day you are living in, not the day in Greenwich.
 */

export type Iso = string;

export function isoOf(d: Date): Iso {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayIso(now: Date = new Date()): Iso {
  return isoOf(now);
}

export function nowTime(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

/** Midday avoids any daylight-saving edge when stepping days. */
function dateOf(iso: Iso): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12);
}

export function addDays(iso: Iso, n: number): Iso {
  const d = dateOf(iso);
  d.setDate(d.getDate() + n);
  return isoOf(d);
}

/** The seven days of `iso`'s week, Monday first. */
export function weekOf(iso: Iso): Iso[] {
  const d = dateOf(iso);
  const back = (d.getDay() + 6) % 7;
  const monday = addDays(iso, -back);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export function weekdayShort(iso: Iso): string {
  return DAYS[(dateOf(iso).getDay() + 6) % 7] ?? "";
}

export function dayOfMonth(iso: Iso): number {
  return dateOf(iso).getDate();
}

/** "10 September 2026" — how a Daily reads in the panel. */
export function longDate(iso: Iso): string {
  const d = dateOf(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()] ?? ""} ${d.getFullYear()}`;
}

/** "This week", "Last week", or the week's month and year. */
export function weekLabel(iso: Iso, today: Iso): string {
  const [start] = weekOf(iso);
  const [thisStart] = weekOf(today);
  if (start === thisStart) return "This week";
  if (start && thisStart && start === addDays(thisStart, -7)) return "Last week";
  if (start && thisStart && start === addDays(thisStart, 7)) return "Next week";
  const d = dateOf(start ?? iso);
  return `${MONTHS[d.getMonth()] ?? ""} ${d.getFullYear()}`;
}
