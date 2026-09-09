import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Paper (light) / Ink (dark) — ADR-010. "system" follows the OS. Per-device until Stage 3 adds the Folio-level Appearance config. */
export type Mode = "paper" | "ink";
export type ModeSetting = Mode | "system";

interface AppearanceState {
  setting: ModeSetting;
  setSetting: (s: ModeSetting) => void;
  cycle: () => void;
}

const ORDER: ModeSetting[] = ["system", "paper", "ink"];

export const useAppearanceStore = create<AppearanceState>()(
  persist(
    (set) => ({
      setting: "system",
      setSetting: (setting) => set({ setting }),
      cycle: () =>
        set((s) => ({ setting: ORDER[(ORDER.indexOf(s.setting) + 1) % ORDER.length] ?? "system" })),
    }),
    { name: "aml.appearance", version: 1 },
  ),
);

export function systemPrefersInk(): boolean {
  return (
    typeof window !== "undefined" && !!window.matchMedia?.("(prefers-color-scheme: dark)").matches
  );
}

export function resolveMode(setting: ModeSetting, systemDark = systemPrefersInk()): Mode {
  if (setting === "system") return systemDark ? "ink" : "paper";
  return setting;
}

export function applyMode(mode: Mode): void {
  document.documentElement.dataset.mode = mode;
}
