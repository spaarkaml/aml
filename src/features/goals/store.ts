import { create } from "zustand";
import { persist } from "zustand/middleware";
import { todayIso } from "@/features/daily/dates";
import { streakOf } from "./goals";

/** Days kept. Enough for a year of streaks without the file growing without end. */
export const HISTORY_DAYS = 400;

interface GoalsState {
  /** ISO date → net words written on this device that day. */
  history: Record<string, number>;
  /** The note the tally is following, and what it counted last. */
  path: string | null;
  last: number;
  /**
   * Adds what has been written since the last call. Switching notes only moves the mark:
   * opening a 4,000-word chapter is not 4,000 words written.
   */
  record: (path: string | null, words: number) => void;
  /** Net words written today. Deleting counts against you, as it should. */
  today: () => number;
  /** Consecutive days meeting `goal`, ending today. */
  streak: (goal: number) => number;
  reset: () => void;
}

/** Keeps the map to the most recent days, newest kept. */
function trim(history: Record<string, number>): Record<string, number> {
  const days = Object.keys(history).sort().slice(-HISTORY_DAYS);
  return Object.fromEntries(days.map((d) => [d, history[d] ?? 0]));
}

/**
 * What you have written, per device (ADR-004 — a session is a fact about this keyboard, not
 * about the work, so it never goes in the Folio). The goals themselves do travel: a note's
 * is in its front matter and the daily one is in `.aml/config.yaml`.
 */
export const useGoalsStore = create<GoalsState>()(
  persist(
    (set, get) => ({
      history: {},
      path: null,
      last: 0,

      record: (path, words) => {
        const { path: previous, last, history } = get();
        if (path !== previous) {
          set({ path, last: words });
          return;
        }
        const delta = words - last;
        if (delta === 0) return;
        const day = todayIso();
        set({
          last: words,
          history: trim({ ...history, [day]: (history[day] ?? 0) + delta }),
        });
      },

      today: () => get().history[todayIso()] ?? 0,
      streak: (goal) => streakOf(get().history, goal, todayIso()),
      reset: () => set({ history: {}, path: null, last: 0 }),
    }),
    { name: "aml.goals", version: 1, partialize: (s) => ({ history: s.history }) },
  ),
);
