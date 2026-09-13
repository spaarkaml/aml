import type { Snapshot } from "@/ipc";
import { dayHeading, formatBytes, groupByDay, nameOf, timeOf } from "./timeline";

function snap(at: Date, label: string | null = null): Snapshot {
  return { id: at.toISOString(), taken: at.toISOString(), label, words: 10, size: 50 };
}

const now = new Date(2026, 8, 14, 15, 30);

describe("history timeline", () => {
  it("names days the way a person would", () => {
    expect(dayHeading(new Date(2026, 8, 14, 0, 5), now)).toBe("Today");
    expect(dayHeading(new Date(2026, 8, 13, 23, 59), now)).toBe("Yesterday");
    expect(dayHeading(new Date(2026, 8, 12, 9, 0), now)).toBe("Sat 12 Sept");
    expect(dayHeading(new Date(2025, 11, 25, 9, 0), now)).toBe("Thu 25 Dec 2025");
  });

  it("gives a twelve-hour time", () => {
    expect(timeOf(new Date(2026, 8, 14, 0, 7))).toBe("12:07 am");
    expect(timeOf(new Date(2026, 8, 14, 12, 0))).toBe("12:00 pm");
    expect(timeOf(new Date(2026, 8, 14, 21, 45))).toBe("9:45 pm");
  });

  it("groups newest-first Snapshots by local day without reordering them", () => {
    const list = [
      snap(new Date(2026, 8, 14, 11, 0)),
      snap(new Date(2026, 8, 14, 9, 0)),
      snap(new Date(2026, 8, 13, 22, 0), "Draft"),
      snap(new Date(2026, 8, 1, 8, 0)),
    ];
    const days = groupByDay(list, now);
    expect(days.map((d) => [d.heading, d.items.length])).toEqual([
      ["Today", 2],
      ["Yesterday", 1],
      ["Tue 1 Sept", 1],
    ]);
    expect(days[0]?.items[0]).toBe(list[0]);
  });

  it("reads a UTC stamp from Rust as a moment, and names it by label first", () => {
    const s: Snapshot = {
      id: "20260914-050000-Draft.md",
      taken: "2026-09-14T05:00:00Z",
      label: "Draft",
      words: 1,
      size: 1,
    };
    const local = new Date(Date.UTC(2026, 8, 14, 5, 0, 0));
    expect(nameOf(s, local)).toBe(`Draft · Today, ${timeOf(local)}`);
  });

  it("formats sizes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(20_000)).toBe("20 KB");
    expect(formatBytes(13_000_000)).toBe("12.4 MB");
  });
});
