import { create } from "zustand";
import { useDailyStore } from "@/features/daily/store";
import { useFolioStore } from "@/features/folio/store";
import { commands } from "@/ipc";

/** What AML uses when the Folio has not said otherwise; the Rust side agrees (WP-3.10). */
export const DEFAULT_DAILY_FOLDER = "journal";

interface SettingsState {
  open: boolean;
  /** The field's text. Empty means "AML's own", and is written to the file as nothing at all. */
  dailyFolder: string;
  /** Set when the last save was refused, cleared as soon as the field changes. */
  error: string | null;
  /** True between a change and the save landing, so the screen can say "Saved". */
  saved: boolean;
  setOpen: (open: boolean) => void;
  load: () => Promise<void>;
  clear: () => void;
  setDailyFolder: (value: string) => void;
  /** Writes the preferences to the Folio. Returns false when the folder was refused. */
  save: () => Promise<boolean>;
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
  error: null,
  saved: false,

  setOpen: (open) => {
    set({ open, error: null, saved: false });
    if (open) void get().load();
  },

  load: async () => {
    const r = await commands.preferencesRead();
    if (r.status === "ok") set({ dailyFolder: r.data.dailyFolder ?? "", error: null });
  },

  clear: () => set({ dailyFolder: "", error: null, saved: false }),

  setDailyFolder: (dailyFolder) => set({ dailyFolder, error: null, saved: false }),

  save: async () => {
    const asked = get().dailyFolder.trim();
    const r = await commands.preferencesWrite({ dailyFolder: asked || null });
    if (r.status !== "ok") {
      set({ error: `“${asked}” is not a folder inside the Folio.` });
      return false;
    }
    set({ dailyFolder: r.data.dailyFolder ?? "", error: null, saved: true });
    // The strip reads a different folder from now on, and the tree may have gained one.
    await useDailyStore.getState().refresh();
    await useFolioStore.getState().refreshTree();
    return true;
  },
}));
