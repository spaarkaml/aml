import { create } from "zustand";
import { useFolioStore } from "@/features/folio/store";
import { useLayoutStore } from "@/features/layout/store";
import { useTabsStore } from "@/features/tabs/store";
import { useTagsStore } from "@/features/tags/store";
import { commands } from "@/ipc";
import { addDays, type Iso, nowTime, todayIso } from "./dates";

interface DailyState {
  /** Dates that already have a Daily note, newest first. */
  dates: Iso[];
  /** The day whose week the strip shows. */
  anchor: Iso;
  refresh: () => Promise<void>;
  clear: () => void;
  /** Opens (creating the first time) the Daily note for `date`. */
  open: (date: Iso) => Promise<string | null>;
  openToday: () => Promise<string | null>;
  /** Moves the strip by `weeks`; 0 returns it to today. */
  page: (weeks: number) => void;
  /** Opens the left panel on the Daily view. */
  show: () => void;
}

export const useDailyStore = create<DailyState>((set, get) => ({
  dates: [],
  anchor: todayIso(),

  refresh: async () => {
    const r = await commands.dailyDates();
    if (r.status === "ok") set({ dates: r.data });
  },

  clear: () => set({ dates: [], anchor: todayIso() }),

  open: async (date) => {
    const r = await commands.dailyNote(date, nowTime());
    if (r.status !== "ok") return null;
    const { path, created } = r.data;
    if (created) {
      // The watcher will catch up, but the strip should mark the day at once.
      set((s) => ({ dates: [date, ...s.dates.filter((d) => d !== date)].sort().reverse() }));
      await useFolioStore.getState().refreshTree();
    }
    useTabsStore.getState().open(path);
    set({ anchor: date });
    return path;
  },

  openToday: () => get().open(todayIso()),

  page: (weeks) => set({ anchor: weeks === 0 ? todayIso() : addDays(get().anchor, weeks * 7) }),

  show: () => {
    useTagsStore.getState().setView("daily");
    useLayoutStore.getState().openPanel("left");
  },
}));
