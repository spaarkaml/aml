import { create } from "zustand";
import { getActiveEditor } from "@/features/editor/editorRef";
import { useEditorStore } from "@/features/editor/store";
import { useTabsStore } from "@/features/tabs/store";
import { commands, type NoteIndexEntry } from "@/ipc";

interface QuickOpenState {
  open: boolean;
  entries: NoteIndexEntry[];
  setOpen: (open: boolean) => void;
  toggle: () => void;
  /** Re-reads the index from Rust (cheap: cached by mtime there). */
  refresh: () => Promise<void>;
  clear: () => void;
}

export const useQuickOpenStore = create<QuickOpenState>((set) => ({
  open: false,
  entries: [],
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
  refresh: async () => {
    const r = await commands.folioIndex();
    if (r.status === "ok") set({ entries: r.data });
  },
  clear: () => set({ entries: [] }),
}));

/** Opens `path` in a tab and, once the editor shows it, moves the caret to `heading`. */
export function openNoteAt(path: string, heading: string | null): void {
  useTabsStore.getState().open(path);
  if (!heading) return;
  const tryJump = (): boolean => {
    const editor = getActiveEditor();
    if (!editor || useEditorStore.getState().path !== path) return false;
    let pos = -1;
    editor.state.doc.descendants((node, p) => {
      if (pos !== -1) return false;
      if (node.type.name === "heading" && node.textContent.trim() === heading) pos = p + 1;
      return pos === -1;
    });
    if (pos !== -1) editor.chain().focus().setTextSelection(pos).scrollIntoView().run();
    return true;
  };
  if (tryJump()) return;
  const deadline = Date.now() + 3000;
  const unsub = useEditorStore.subscribe(() => {
    // The editor instance appears one frame after the store changes path.
    requestAnimationFrame(() => {
      if (tryJump() || Date.now() > deadline) unsub();
    });
  });
}
