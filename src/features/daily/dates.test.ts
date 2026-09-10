import { describe, expect, it } from "vitest";
import {
  addDays,
  dayOfMonth,
  isoOf,
  longDate,
  nowTime,
  todayIso,
  weekdayShort,
  weekLabel,
  weekOf,
} from "./dates";

describe("local civil dates", () => {
  it("reads the device's own day, not UTC", () => {
    // 23:30 local on the 10th is still the 10th, whatever the offset to Greenwich.
    const late = new Date(2026, 8, 10, 23, 30);
    expect(isoOf(late)).toBe("2026-09-10");
    expect(todayIso(late)).toBe("2026-09-10");
    expect(nowTime(late)).toBe("23:30");
    expect(nowTime(new Date(2026, 8, 10, 9, 5))).toBe("09:05");
  });

  it("steps days across months, years and daylight saving", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    // Australian DST starts on the first Sunday of October; the day before is still one day.
    expect(addDays("2026-10-03", 1)).toBe("2026-10-04");
    expect(addDays("2026-10-04", 1)).toBe("2026-10-05");
  });

  it("lays out a week from Monday", () => {
    // 2026-09-10 is a Thursday.
    expect(weekOf("2026-09-10")).toEqual([
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
      "2026-09-13",
    ]);
    // A Sunday belongs to the week that started six days earlier, not the next one.
    expect(weekOf("2026-09-13")[0]).toBe("2026-09-07");
    expect(weekOf("2026-09-14")[0]).toBe("2026-09-14");
  });

  it("labels days and weeks the way the panel shows them", () => {
    expect(weekdayShort("2026-09-10")).toBe("Thu");
    expect(dayOfMonth("2026-09-10")).toBe(10);
    expect(longDate("2026-09-10")).toBe("10 September 2026");
    expect(weekLabel("2026-09-10", "2026-09-10")).toBe("This week");
    expect(weekLabel("2026-09-03", "2026-09-10")).toBe("Last week");
    expect(weekLabel("2026-09-17", "2026-09-10")).toBe("Next week");
    expect(weekLabel("2026-07-15", "2026-09-10")).toBe("July 2026");
  });
});
