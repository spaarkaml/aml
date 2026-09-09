import { create } from "zustand";

/** State of the `/` block menu, written by the SlashMenu ProseMirror plugin. */
interface SlashState {
  active: boolean;
  /** Document position of the `/` character. */
  from: number;
  query: string;
  index: number;
  /** Viewport coordinates of the caret line, for anchoring the menu. */
  left: number;
  bottom: number;
  set: (s: Partial<SlashState>) => void;
}

export const useSlashStore = create<SlashState>((set) => ({
  active: false,
  from: 0,
  query: "",
  index: 0,
  left: 0,
  bottom: 0,
  set: (s) => set(s),
}));
