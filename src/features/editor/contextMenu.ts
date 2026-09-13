import { create } from "zustand";

/** Where the editor's own right-click menu is, and what it was opened on. */
interface EditorMenuState {
  menu: { x: number; y: number; src: string | null } | null;
  openMenu: (m: NonNullable<EditorMenuState["menu"]>) => void;
  closeMenu: () => void;
}

export const useEditorMenuStore = create<EditorMenuState>()((set) => ({
  menu: null,
  openMenu: (menu) => set({ menu }),
  closeMenu: () => set({ menu: null }),
}));
