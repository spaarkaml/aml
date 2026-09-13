import { create } from "zustand";
import { useDailyStore } from "@/features/daily/store";
import { useFolioStore } from "@/features/folio/store";
import { commands, type Preferences, type SnapshotUsage } from "@/ipc";

/** What AML uses when the Folio has not said otherwise; the Rust side agrees (WP-3.10). */
export const DEFAULT_DAILY_FOLDER = "journal";

interface SettingsState {
  open: boolean;
  /** The field's text. Empty means "AML's own", and is written to the file as nothing at all. */
  dailyFolder: string;
  /** Words a day to aim for, as typed. Empty means no daily goal (Q18: all goals opt-in). */
  dailyGoal: string;
  /** Snapshot retention in days, as typed. Empty means AML's own (7 and 90, ADR-006). */
  keepAllDays: string;
  keepDailyDays: string;
  /** How much room this Folio's Snapshots take; read when the screen opens. */
  snapshotUsage: SnapshotUsage | null;
  /** Set when the last save was refused, cleared as soon as the field changes. */
  error: string | null;
  /** True between a change and the save landing, so the screen can say "Saved". */
  saved: boolean;
  setOpen: (open: boolean) => void;
  load: () => Promise<void>;
  clear: () => void;
  setDailyFolder: (value: string) => void;
  setDailyGoal: (value: string) => void;
  setKeepAllDays: (value: string) => void;
  setKeepDailyDays: (value: string) => void;
  /** Writes the preferences to the Folio. Returns false when the folder was refused. */
  save: () => Promise<boolean>;
}

/** A whole number of days, at least one; anything else is "AML's own". */
function days(value: string): number | null {
  const n = Number(value.trim());
  return value.trim() && Number.isFinite(n) && n >= 1 ? Math.round(n) : null;
}

function fields(p: Preferences) {
  return {
    dailyFolder: p.dailyFolder ?? "",
    dailyGoal: p.dailyGoal ? String(p.dailyGoal) : "",
    keepAllDays: p.snapshotKeepAllDays ? String(p.snapshotKeepAllDays) : "",
    keepDailyDays: p.snapshotKeepDailyDays ? String(p.snapshotKeepDailyDays) : "",
  };
}

/**
 * Settings that belong to the Folio but are not appearance (WP-3.10).
 *
 * Like appearance, these live in `.aml/config.yaml` and so travel with the work — there is
 * no device layer here, because a Daily note has to land in the same folder on both machines
 * or the calendar strip disagrees with itself.
 */
export const useSettingsStore = create<SettingsState>((set, get) => ({
  open: false,
  dailyFolder: "",
  dailyGoal: "",
  keepAllDays: "",
  keepDailyDays: "",
  snapshotUsage: null,
  error: null,
  saved: false,

  setOpen: (open) => {
    set({ open, error: null, saved: false });
    if (open) void get().load();
  },

  load: async () => {
    const [r, usage] = await Promise.all([commands.preferencesRead(), commands.snapshotsUsage()]);
    if (r.status === "ok") set({ ...fields(r.data), error: null });
    set({ snapshotUsage: usage.status === "ok" ? usage.data : null });
  },

  clear: () =>
    set({
      dailyFolder: "",
      dailyGoal: "",
      keepAllDays: "",
      keepDailyDays: "",
      snapshotUsage: null,
      error: null,
      saved: false,
    }),

  setDailyFolder: (dailyFolder) => set({ dailyFolder, error: null, saved: false }),
  setDailyGoal: (dailyGoal) => set({ dailyGoal, error: null, saved: false }),
  setKeepAllDays: (keepAllDays) => set({ keepAllDays, error: null, saved: false }),
  setKeepDailyDays: (keepDailyDays) => set({ keepDailyDays, error: null, saved: false }),

  save: async () => {
    const asked = get().dailyFolder.trim();
    const goal = Number(get().dailyGoal.trim());
    const r = await commands.preferencesWrite({
      dailyFolder: asked || null,
      dailyGoal: Number.isFinite(goal) && goal > 0 ? Math.round(goal) : null,
      snapshotKeepAllDays: days(get().keepAllDays),
      snapshotKeepDailyDays: days(get().keepDailyDays),
    });
    if (r.status !== "ok") {
      set({ error: `“${asked}” is not a folder inside the Folio.` });
      return false;
    }
    set({ ...fields(r.data), error: null, saved: true });
    // The strip reads a different folder from now on, and the tree may have gained one.
    await useDailyStore.getState().refresh();
    await useFolioStore.getState().refreshTree();
    return true;
  },
}));
