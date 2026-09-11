import { vi } from "vitest";
import { HISTORY_DAYS, useGoalsStore } from "./store";

const s = () => useGoalsStore.getState();
const TODAY = "2026-09-11";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${TODAY}T09:00:00`));
  useGoalsStore.setState({ history: {}, path: null, last: 0 });
});

afterEach(() => vi.useRealTimers());

describe("goals store", () => {
  it("counts what you write, not what you open", () => {
    // Opening a note that already has 4,000 words in it is not 4,000 words written.
    s().record("Thesis/03.md", 4000);
    expect(s().today()).toBe(0);

    s().record("Thesis/03.md", 4120);
    s().record("Thesis/03.md", 4180);
    expect(s().today()).toBe(180);

    // Switching notes only moves the mark.
    s().record("Inbox.md", 12);
    expect(s().today()).toBe(180);
    s().record("Inbox.md", 42);
    expect(s().today()).toBe(210);
  });

  it("counts deleting against you, because it is not writing", () => {
    s().record("a.md", 100);
    s().record("a.md", 300);
    s().record("a.md", 250);
    expect(s().today()).toBe(150);
  });

  it("keeps the last day's worth and no more", () => {
    const history: Record<string, number> = {};
    for (let i = 0; i < HISTORY_DAYS + 20; i++) {
      const d = new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10);
      history[d] = 10;
    }
    useGoalsStore.setState({ history, path: "a.md", last: 0 });
    s().record("a.md", 5);
    const days = Object.keys(s().history);
    expect(days.length).toBeLessThanOrEqual(HISTORY_DAYS + 1);
    // The oldest go, not the newest.
    expect(days).toContain(TODAY);
    expect(days).not.toContain("2025-01-01");
  });

  it("reads a streak against whatever goal it is given", () => {
    useGoalsStore.setState({
      history: { "2026-09-11": 100, "2026-09-10": 600, "2026-09-09": 700 },
    });
    expect(s().streak(500)).toBe(2);
    expect(s().streak(0)).toBe(0);
  });
});
