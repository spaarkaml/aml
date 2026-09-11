import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Per-device layout state (ADR-004: never inside the Folio).
 * A side panel is either closed, open as a slide-over (overlay), or pinned (takes space).
 * A Layout is a named preset of pinned panels; "desk" and "page" are built in.
 */
export type LayoutName = "desk" | "page";
export type Side = "left" | "right";
/**
 * Which list the left panel shows. Lives here because it is layout, not any one feature.
 * Three, so they fit one line: Tags now sit under Search, and the Daily strip under the Folio
 * tree, because that is where each is reached for (WP-3.10).
 */
export type LeftView = "folio" | "boundings" | "search";

export interface PanelState {
  open: boolean;
  pinned: boolean;
  width: number;
}

interface LayoutState {
  layout: LayoutName;
  left: PanelState;
  right: PanelState;
  leftView: LeftView;
  setLeftView: (view: LeftView) => void;
  setLayout: (name: LayoutName) => void;
  toggleLayout: () => void;
  togglePanel: (side: Side) => void;
  openPanel: (side: Side) => void;
  setPinned: (side: Side, pinned: boolean) => void;
  togglePinned: (side: Side) => void;
  setWidth: (side: Side, width: number) => void;
  closeOverlays: () => void;
}

export const LAYOUT_PRESETS: Record<LayoutName, Pick<LayoutState, "left" | "right">> = {
  desk: {
    left: { open: true, pinned: true, width: 260 },
    right: { open: false, pinned: false, width: 320 },
  },
  page: {
    left: { open: false, pinned: false, width: 260 },
    right: { open: false, pinned: false, width: 320 },
  },
};

export const MIN_PANEL_WIDTH = 200;
export const MAX_PANEL_WIDTH = 560;

/**
 * v1 had five left views. A device left on one of the two that went away lands on the tab
 * that now holds it — Tags under Search, the Daily strip under the Folio tree — rather than
 * on an empty panel.
 */
export function migrateLayout(state: unknown, version: number): LayoutState {
  const s = (state ?? {}) as Partial<LayoutState> & { leftView?: string };
  if (version >= 2) return s as LayoutState;
  const moved: Record<string, LeftView> = { tags: "search", daily: "folio" };
  const view = s.leftView ?? "folio";
  return { ...s, leftView: moved[view] ?? (view as LeftView) } as LayoutState;
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      layout: "desk",
      ...LAYOUT_PRESETS.desk,
      leftView: "folio",
      setLeftView: (leftView) => set({ leftView }),
      setLayout: (name) => set({ layout: name, ...LAYOUT_PRESETS[name] }),
      toggleLayout: () =>
        set((s) => {
          const next: LayoutName = s.layout === "desk" ? "page" : "desk";
          return { layout: next, ...LAYOUT_PRESETS[next] };
        }),
      togglePanel: (side) => set((s) => ({ [side]: { ...s[side], open: !s[side].open } })),
      openPanel: (side) => set((s) => ({ [side]: { ...s[side], open: true } })),
      setPinned: (side, pinned) =>
        set((s) => ({ [side]: { ...s[side], pinned, open: pinned ? true : s[side].open } })),
      togglePinned: (side) =>
        set((s) => {
          const pinned = !s[side].pinned;
          return { [side]: { ...s[side], pinned, open: pinned ? true : s[side].open } };
        }),
      setWidth: (side, width) =>
        set((s) => ({
          [side]: {
            ...s[side],
            width: Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, Math.round(width))),
          },
        })),
      closeOverlays: () =>
        set((s) => ({
          left: s.left.pinned ? s.left : { ...s.left, open: false },
          right: s.right.pinned ? s.right : { ...s.right, open: false },
        })),
    }),
    {
      name: "aml.layout",
      version: 2,
      migrate: migrateLayout,
    },
  ),
);
