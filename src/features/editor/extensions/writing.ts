import { Extension } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { sentenceAt } from "@/features/writing/sentences";
import { type FocusMode, useWritingStore } from "@/features/writing/store";

/** Where the caret line sits on screen in Typewriter Mode, as a fraction of the page. */
export const TYPEWRITER_LINE = 0.42;

function decorate(state: EditorState, focus: FocusMode): DecorationSet {
  if (focus === "off") return DecorationSet.empty;
  const { doc, selection } = state;
  const $head = selection.$head;
  // The top-level block the caret is in; everything else in the note is dimmed.
  const blockPos = $head.depth > 0 ? $head.before(1) : -1;
  const decorations: Decoration[] = [];
  doc.forEach((node, offset) => {
    if (offset !== blockPos) {
      decorations.push(Decoration.node(offset, offset + node.nodeSize, { class: "aml-dim" }));
    }
  });

  if (focus === "sentence" && blockPos !== -1) {
    const parent = $head.parent;
    const start = $head.start();
    // A leaf inline node (a tag, a wiki link) stands in as one character, which keeps these
    // offsets lined up with the document positions below.
    const text = parent.textBetween(0, parent.content.size, "", " ");
    const [from, to] = sentenceAt(text, $head.parentOffset);
    if (from > 0) decorations.push(Decoration.inline(start, start + from, { class: "aml-dim" }));
    if (to < parent.content.size) {
      decorations.push(
        Decoration.inline(start + to, start + parent.content.size, { class: "aml-dim" }),
      );
    }
  }
  return DecorationSet.create(doc, decorations);
}

/** Puts the caret's line at a fixed height in its scroll container. */
function typewriterScroll(view: EditorView): void {
  const container = view.dom.closest("[data-scroll]");
  if (!(container instanceof HTMLElement)) return;
  const caret = view.coordsAtPos(view.state.selection.head);
  const box = container.getBoundingClientRect();
  const delta = caret.top - (box.top + box.height * TYPEWRITER_LINE);
  if (Math.abs(delta) > 1) container.scrollTop += delta;
}

/**
 * Focus and Typewriter modes (WP-3.1). Both are decorations on the view rather than changes to
 * the document: nothing here can alter a single byte of the note.
 */
export const WritingModes = Extension.create({
  name: "writingModes",

  addProseMirrorPlugins() {
    const key = new PluginKey<{ focus: FocusMode; set: DecorationSet }>("amlWritingModes");
    let unsubscribe: (() => void) | null = null;

    return [
      new Plugin<{ focus: FocusMode; set: DecorationSet }>({
        key,
        state: {
          init(_, state) {
            const focus = useWritingStore.getState().focus;
            return { focus, set: decorate(state, focus) };
          },
          apply(tr, prev, _old, state) {
            const focus = (tr.getMeta(key) as FocusMode | undefined) ?? prev.focus;
            const moved = tr.docChanged || tr.selectionSet || focus !== prev.focus;
            return moved ? { focus, set: decorate(state, focus) } : prev;
          },
        },
        view(view) {
          let { focus, typewriter } = useWritingStore.getState();
          if (typewriter) requestAnimationFrame(() => typewriterScroll(view));
          unsubscribe = useWritingStore.subscribe((s) => {
            if (s.focus !== focus) {
              focus = s.focus;
              view.dispatch(view.state.tr.setMeta(key, focus));
            }
            if (s.typewriter !== typewriter) {
              typewriter = s.typewriter;
              if (typewriter) requestAnimationFrame(() => typewriterScroll(view));
            }
          });
          return {
            update(v, prev) {
              if (!useWritingStore.getState().typewriter) return;
              if (v.state.doc === prev.doc && v.state.selection.eq(prev.selection)) return;
              // After the DOM has been updated, or coordsAtPos measures the old layout.
              requestAnimationFrame(() => typewriterScroll(v));
            },
            destroy() {
              unsubscribe?.();
              unsubscribe = null;
            },
          };
        },
        props: {
          decorations(state) {
            return key.getState(state)?.set ?? DecorationSet.empty;
          },
        },
      }),
    ];
  },
});
