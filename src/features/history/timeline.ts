import type { Snapshot } from "@/ipc";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sept",
  "Oct",
  "Nov",
  "Dec",
];

/** When a Snapshot was taken. Rust stamps them in UTC; they are shown in local time. */
export function takenAt(s: Pick<Snapshot, "taken">): Date {
  return new Date(s.taken);
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** `Today`, `Yesterday`, `Sat 12 Sept`, or `Sat 12 Sept 2025` from another year. */
export function dayHeading(d: Date, now: Date): string {
  if (dayKey(d) === dayKey(now)) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dayKey(d) === dayKey(yesterday)) return "Yesterday";
  const base = `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

/** `10:32 am`. */
export function timeOf(d: Date): string {
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? "am" : "pm"}`;
}

export interface Day {
  key: string;
  heading: string;
  items: Snapshot[];
}

/** Newest first, in the order given, split where the local day changes. */
export function groupByDay(list: Snapshot[], now: Date): Day[] {
  const out: Day[] = [];
  for (const s of list) {
    const at = takenAt(s);
    const key = dayKey(at);
    const last = out[out.length - 1];
    if (last?.key === key) last.items.push(s);
    else out.push({ key, heading: dayHeading(at, now), items: [s] });
  }
  return out;
}

/** `840 KB`, `12.4 MB`. */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

/** What a Snapshot is called in a sentence: its label, or when it was taken. */
export function nameOf(s: Snapshot, now: Date): string {
  const at = takenAt(s);
  const when = `${dayHeading(at, now)}, ${timeOf(at)}`;
  return s.label ? `${s.label} · ${when}` : when;
}
