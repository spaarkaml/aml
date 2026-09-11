import { create } from "zustand";
import { persist } from "zustand/middleware";
import { commandRegistry } from "./registry";

interface KeymapState {
  /** Command id → shortcut, or null for "no key at all". Absent means the default. */
  overrides: Record<string, string | null>;
  /** The command whose key is being recorded, if any. */
  recording: string | null;
  /** Why the last recording was refused, for the dialog to show. */
  error: string | null;
  open: boolean;
  setOpen: (open: boolean) => void;
  record: (id: string | null) => void;
  fail: (error: string | null) => void;
  /** Binds `id` to `shortcut`, or to nothing when it is null. */
  bind: (id: string, shortcut: string | null) => void;
  /** Puts a command back on the key it shipped with. */
  reset: (id: string) => void;
  resetAll: () => void;
}

export const useKeymapStore = create<KeymapState>()(
  persist(
    (set, get) => ({
      overrides: {},
      recording: null,
      error: null,
      open: false,

      setOpen: (open) => set({ open, recording: null, error: null }),
      record: (recording) => set({ recording, error: null }),
      fail: (error) => set({ error }),

      bind: (id, shortcut) => {
        const overrides = { ...get().overrides, [id]: shortcut };
        set({ overrides, recording: null, error: null });
        commandRegistry.setOverrides(overrides);
      },

      reset: (id) => {
        const overrides = { ...get().overrides };
        delete overrides[id];
        set({ overrides, recording: null, error: null });
        commandRegistry.setOverrides(overrides);
      },

      resetAll: () => {
        set({ overrides: {}, recording: null, error: null });
        commandRegistry.setOverrides({});
      },
    }),
    {
      name: "aml.keymap",
      version: 1,
      partialize: (s) => ({ overrides: s.overrides }),
      // The registry is the thing that actually answers key presses, so it has to be told
      // what was stored before the first keystroke arrives.
      onRehydrateStorage: () => (state) => {
        if (state) commandRegistry.setOverrides(state.overrides);
      },
    },
  ),
);
