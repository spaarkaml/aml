import { create } from "zustand";

interface StatsState {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

/** Statistics is a screen rather than a panel section (WP-3.7): the per-heading table wants
 *  the width, and nothing here is wanted while you are writing. */
export const useStatsStore = create<StatsState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
}));
