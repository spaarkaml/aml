import type { Field } from "@/features/properties/frontmatter";
import { daysLeft, describePace, fraction, noteGoal, pacePerDay, streakOf } from "./goals";

const field = (key: string, value: unknown): Field => ({ key, value, kind: "other" });

describe("a note's own goal", () => {
  it("is read from its front matter, as a number however it was typed", () => {
    expect(noteGoal([field("target_words", 4000)])).toEqual({ target: 4000, deadline: null });
    expect(noteGoal([field("target_words", "4000")])?.target).toBe(4000);
    expect(noteGoal([field("target_words", 4000), field("deadline", "2026-12-01")])?.deadline).toBe(
      "2026-12-01",
    );
  });

  it("is nothing at all unless it is a positive number", () => {
    expect(noteGoal([])).toBeNull();
    expect(noteGoal([field("target_words", 0)])).toBeNull();
    expect(noteGoal([field("target_words", -100)])).toBeNull();
    expect(noteGoal([field("target_words", "soon")])).toBeNull();
    // A deadline AML cannot read is no deadline, not a broken goal.
    expect(
      noteGoal([field("target_words", 10), field("deadline", "December")])?.deadline,
    ).toBeNull();
  });
});

describe("progress", () => {
  it("is a fraction that neither overflows nor goes backwards", () => {
    expect(fraction(250, 500)).toBe(0.5);
    expect(fraction(900, 500)).toBe(1);
    expect(fraction(-20, 500)).toBe(0);
    expect(fraction(10, 0)).toBe(0);
  });
});

describe("deadlines", () => {
  it("count today as a day you still have", () => {
    expect(daysLeft("2026-09-11", "2026-09-11")).toBe(1);
    expect(daysLeft("2026-09-18", "2026-09-11")).toBe(8);
    // Gone is gone: no number is better than a wrong one.
    expect(daysLeft("2026-09-10", "2026-09-11")).toBeNull();
  });

  it("turn words remaining into words a day", () => {
    const goal = { target: 4000, deadline: "2026-09-18" };
    expect(pacePerDay(goal, 400, "2026-09-11")).toEqual({ perDay: 450, days: 8 });
    // Finished, overdue, or with no deadline at all: nothing to say.
    expect(pacePerDay(goal, 4000, "2026-09-11")).toBeNull();
    expect(pacePerDay(goal, 400, "2026-10-01")).toBeNull();
    expect(pacePerDay({ target: 4000, deadline: null }, 400, "2026-09-11")).toBeNull();
  });

  it("say the pace in words", () => {
    expect(describePace({ perDay: 450, days: 8 })).toBe("450 words a day for 8 days");
    expect(describePace({ perDay: 1200, days: 1 })).toBe("1,200 words to finish today");
    expect(describePace(null)).toBeNull();
  });
});

describe("streaks", () => {
  const history = {
    "2026-09-11": 200,
    "2026-09-10": 600,
    "2026-09-09": 500,
    "2026-09-08": 120,
  };

  it("survive a morning: today does not count against you until it is over", () => {
    // 200 of 500 written so far today, and the two days before were met.
    expect(streakOf(history, 500, "2026-09-11")).toBe(2);
  });

  it("extend as soon as today is met", () => {
    expect(streakOf({ ...history, "2026-09-11": 500 }, 500, "2026-09-11")).toBe(3);
  });

  it("stop at the first day that fell short, and mean nothing without a goal", () => {
    expect(streakOf(history, 100, "2026-09-11")).toBe(4);
    expect(streakOf(history, 5000, "2026-09-11")).toBe(0);
    expect(streakOf(history, 0, "2026-09-11")).toBe(0);
  });
});
