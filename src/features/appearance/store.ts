import { create } from "zustand";
import { persist } from "zustand/middleware";
import { type Appearance, commands } from "@/ipc";
import { DEFAULTS, EDITOR_FONTS, fontStack, TYPE_DEFAULTS, UI_FONTS } from "./tokens";

/** Paper (light) / Ink (dark) — ADR-010. "system" follows the OS. */
export type Mode = "paper" | "ink";
export type ModeSetting = Mode | "system";

const ORDER: ModeSetting[] = ["system", "paper", "ink"];

export const EMPTY: Appearance = {
  mode: null,
  uiFont: null,
  editorFont: null,
  measure: null,
  leading: null,
  paragraphSpacing: null,
  paper: {},
  ink: {},
};

interface AppearanceState {
  /** What the Folio says (ADR-010: colours and type follow the work between machines). */
  folio: Appearance;
  /** This machine's own settings, used instead of the Folio's while `useDevice` is on. */
  device: Appearance;
  /** The one machine you want different. */
  useDevice: boolean;
  open: boolean;
  /** True while a Folio is open and its settings have been read. */
  loaded: boolean;
  setOpen: (open: boolean) => void;
  setUseDevice: (useDevice: boolean) => void;
  /** Reads the open Folio's settings; called when a Folio opens. */
  load: () => Promise<void>;
  clear: () => void;
  /** Changes one setting in whichever layer is in charge, and saves. */
  patch: (patch: Partial<Appearance>) => void;
  setToken: (mode: Mode, token: string, hex: string | null) => void;
  resetMode: (mode: Mode) => void;
  resetAll: () => void;
  cycle: () => void;
  setSetting: (setting: ModeSetting) => void;
}

/** The layer in charge: this device's settings, or the Folio's. */
export function current(
  state: Pick<AppearanceState, "folio" | "device" | "useDevice">,
): Appearance {
  return state.useDevice ? state.device : state.folio;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function saveSoon(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const { folio, useDevice, loaded } = useAppearanceStore.getState();
    // Only the Folio layer is written to disk; the device layer is this machine's business.
    if (!useDevice && loaded) void commands.appearanceWrite(folio);
  }, 300);
}

export const useAppearanceStore = create<AppearanceState>()(
  persist(
    (set, get) => ({
      folio: EMPTY,
      device: EMPTY,
      useDevice: false,
      open: false,
      loaded: false,

      setOpen: (open) => set({ open }),
      setUseDevice: (useDevice) => set({ useDevice }),

      load: async () => {
        const r = await commands.appearanceRead();
        if (r.status === "ok") set({ folio: r.data, loaded: true });
      },

      clear: () => set({ folio: EMPTY, loaded: false }),

      patch: (patch) => {
        const { useDevice } = get();
        const layer = useDevice ? "device" : "folio";
        set((s) => ({ [layer]: { ...s[layer], ...patch } }) as Partial<AppearanceState>);
        saveSoon();
      },

      setToken: (mode, token, hex) => {
        const { useDevice } = get();
        const layer = useDevice ? "device" : "folio";
        set((s) => {
          const colours = { ...s[layer][mode] };
          if (hex) colours[token] = hex;
          else delete colours[token];
          return { [layer]: { ...s[layer], [mode]: colours } } as Partial<AppearanceState>;
        });
        saveSoon();
      },

      resetMode: (mode) => {
        const { useDevice } = get();
        const layer = useDevice ? "device" : "folio";
        set((s) => ({ [layer]: { ...s[layer], [mode]: {} } }) as Partial<AppearanceState>);
        saveSoon();
      },

      resetAll: () => {
        const { useDevice } = get();
        const layer = useDevice ? "device" : "folio";
        set((s) => ({ [layer]: { ...EMPTY, mode: s[layer].mode } }) as Partial<AppearanceState>);
        saveSoon();
      },

      setSetting: (setting) => get().patch({ mode: setting }),

      cycle: () => {
        const now = (current(get()).mode ?? "system") as ModeSetting;
        get().patch({ mode: ORDER[(ORDER.indexOf(now) + 1) % ORDER.length] ?? "system" });
      },
    }),
    {
      name: "aml.appearance",
      version: 2,
      partialize: (s) => ({ device: s.device, useDevice: s.useDevice }),
    },
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

/**
 * Writes the chosen colours and type onto `:root` as custom properties. Anything not set is
 * removed rather than written as a default, so `tokens.css` stays the single source of the
 * defaults and a reset needs no copy of them.
 */
export function applyAppearance(appearance: Appearance, mode: Mode): void {
  const root = document.documentElement;
  const colours = mode === "ink" ? appearance.ink : appearance.paper;
  for (const token of Object.keys(DEFAULTS.paper)) {
    const hex = colours[token];
    if (hex) root.style.setProperty(`--aml-${token}`, hex);
    else root.style.removeProperty(`--aml-${token}`);
  }
  const ui = fontStack(UI_FONTS, appearance.uiFont);
  const editor = fontStack(EDITOR_FONTS, appearance.editorFont);
  if (ui) root.style.setProperty("--aml-font-ui", ui);
  else root.style.removeProperty("--aml-font-ui");
  if (editor) root.style.setProperty("--aml-font-editor", editor);
  else root.style.removeProperty("--aml-font-editor");

  const set = (name: string, value: number | null | undefined, unit = "") => {
    if (value === null || value === undefined) root.style.removeProperty(name);
    else root.style.setProperty(name, `${value}${unit}`);
  };
  set("--aml-measure", appearance.measure, "ch");
  set("--aml-leading", appearance.leading);
  set("--aml-paragraph-spacing", appearance.paragraphSpacing, "em");
}

/** The values the screen shows: what is set, or AML's own. */
export function effectiveType(appearance: Appearance) {
  return {
    measure: appearance.measure ?? TYPE_DEFAULTS.measure,
    leading: appearance.leading ?? TYPE_DEFAULTS.leading,
    paragraphSpacing: appearance.paragraphSpacing ?? TYPE_DEFAULTS.paragraphSpacing,
  };
}
