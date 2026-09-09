import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Per-device spell-check switch plus the transient suggestion menu state. */
interface SpellState {
  enabled: boolean;
  toggle: () => void;
  menu: { word: string; from: number; to: number; x: number; y: number } | null;
  openMenu: (m: NonNullable<SpellState["menu"]>) => void;
  closeMenu: () => void;
}

export const useSpellStore = create<SpellState>()(
  persist(
    (set) => ({
      enabled: true,
      toggle: () => set((s) => ({ enabled: !s.enabled })),
      menu: null,
      openMenu: (menu) => set({ menu }),
      closeMenu: () => set({ menu: null }),
    }),
    { name: "aml.spell", version: 1, partialize: (s) => ({ enabled: s.enabled }) },
  ),
);
