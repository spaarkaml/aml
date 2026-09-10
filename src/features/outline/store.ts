import { TextSelection } from "@tiptap/pm/state";
import { create } from "zustand";
import { getActiveEditor } from "@/features/editor/editorRef";
import { useLayoutStore } from "@/features/layout/store";
import { activeIndex, type DocLike, outlineOf, planMove, stepTarget } from "./outline";

/** What the panel renders. Positions are deliberately left out: they change on every
    keystroke, and the store would then churn React for edits that move no heading. */
export interface OutlineItem {
  index: number;
  level: number;
  depth: number;
  text: string;
}

interface OutlineState {
  items: OutlineItem[];
  /** The editor view whose document the outline describes. */
  owner: object | null;
  /** Index of the section holding the caret, or -1. */
  active: number;
  /**
   * Called by the editor plugin on every document or selection change. `owner` identifies
   * the editor view: switching notes creates the new view before destroying the old one,
   * so only the view that last synced may clear the outline again.
   */
  sync: (owner: object, doc: DocLike, caret: number) => void;
  /** Clears the outline if `owner` is still the one that filled it. */
  release: (owner: object) => void;
  jump: (index: number) => void;
  /** Moves the section at `source` before the heading at `target` (length = to the end). */
  move: (source: number, target: number) => void;
  /** Moves the caret's section one place among its peers; false when it cannot. */
  step: (direction: -1 | 1) => boolean;
  /** Opens the Context panel on the Outline. */
  show: () => void;
}

function same(a: OutlineItem[], b: OutlineItem[]): boolean {
  return (
    a.length === b.length &&
    a.every((x, i) => {
      const y = b[i];
      return !!y && x.level === y.level && x.depth === y.depth && x.text === y.text;
    })
  );
}

export const useOutlineStore = create<OutlineState>((set, get) => ({
  items: [],
  active: -1,
  owner: null,

  sync: (owner, doc, caret) => {
    if (get().owner !== owner) set({ owner });
    const headings = outlineOf(doc);
    const items = headings.map(({ index, level, depth, text }) => ({ index, level, depth, text }));
    const active = activeIndex(headings, caret);
    const prev = get();
    if (active !== prev.active) set({ active });
    if (!same(items, prev.items)) set({ items });
  },

  release: (owner) => {
    if (get().owner === owner) set({ owner: null, items: [], active: -1 });
  },

  jump: (index) => {
    const editor = getActiveEditor();
    const h = editor ? outlineOf(editor.state.doc)[index] : undefined;
    if (!editor || !h) return;
    editor
      .chain()
      .setTextSelection(h.pos + 1)
      .scrollIntoView()
      .run();
    // Tiptap's focus() command does not always move DOM focus out of the panel button;
    // focusing the view itself does, and typing must land in the note we just jumped to.
    editor.view.focus();
  },

  move: (source, target) => {
    const editor = getActiveEditor();
    if (!editor) return;
    const { state, view } = editor;
    const plan = planMove(outlineOf(state.doc), source, target, state.doc.content.size);
    if (!plan) return;
    const content = state.doc.slice(plan.from, plan.to).content;
    const tr = state.tr.delete(plan.from, plan.to);
    const at = tr.mapping.map(plan.insert);
    tr.insert(at, content);
    // Keep the caret in the section that moved, so repeating the move works on it again.
    tr.setSelection(TextSelection.near(tr.doc.resolve(at + 1)));
    tr.scrollIntoView();
    view.dispatch(tr);
    view.focus();
  },

  step: (direction) => {
    const editor = getActiveEditor();
    if (!editor) return false;
    const headings = outlineOf(editor.state.doc);
    const index = activeIndex(headings, editor.state.selection.from);
    if (index === -1) return false;
    const target = stepTarget(headings, index, direction);
    if (target === null) return false;
    get().move(index, target);
    return true;
  },

  show: () => useLayoutStore.getState().openPanel("right"),
}));
