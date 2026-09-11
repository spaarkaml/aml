import { create } from "zustand";
import { persist } from "zustand/middleware";

/** How much of the note stays lit: nothing dimmed, the block you are in, or the sentence. */
export type FocusMode = "off" | "paragraph" | "sentence";

const FOCUS_ORDER: FocusMode[] = ["off", "paragraph", "sentence"];

export const FOCUS_LABEL: Record<FocusMode, string> = {
  off: "Off",
  paragraph: "Paragraph",
  sentence: "Sentence",
};

interface WritingState {
  focus: FocusMode;
  /** Keeps the line you are typing on at a fixed height on screen. */
  typewriter: boolean;
  /** Hides every panel and bar; the page and nothing else. */
  zen: boolean;
  setFocus: (focus: FocusMode) => void;
  cycleFocus: () => void;
  toggleTypewriter: () => void;
  toggleZen: () => void;
  setZen: (zen: boolean) => void;
}

/**
 * The writing modes (WP-3.1). Per device, like every other comfort setting: the same Folio
 * is read on a laptop screen and a desk monitor, and they do not want the same thing.
 */
export const useWritingStore = create<WritingState>()(
  persist(
    (set, get) => ({
      focus: "off",
      typewriter: false,
      zen: false,

      setFocus: (focus) => set({ focus }),
      cycleFocus: () => {
        const next = FOCUS_ORDER[(FOCUS_ORDER.indexOf(get().focus) + 1) % FOCUS_ORDER.length];
        set({ focus: next ?? "off" });
      },
      toggleTypewriter: () => set((s) => ({ typewriter: !s.typewriter })),
      toggleZen: () => set((s) => ({ zen: !s.zen })),
      setZen: (zen) => set({ zen }),
    }),
    { name: "aml.writing", version: 1 },
  ),
);
