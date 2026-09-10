import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { useOutlineStore } from "@/features/outline/store";

/**
 * Keeps the Outline panel in step with the open note (WP-2.6): the heading list follows
 * every document change and the highlighted section follows the caret. The store ignores
 * updates that move no heading, so typing inside a paragraph costs one comparison.
 */
export const Outline = Extension.create({
  name: "outline",

  addProseMirrorPlugins() {
    // One token per editor view: switching notes mounts the new view before the old one is
    // destroyed, and the outgoing view must not clear an outline it no longer owns.
    const token = {};
    const push = (view: EditorView) =>
      useOutlineStore.getState().sync(token, view.state.doc, view.state.selection.from);

    return [
      new Plugin({
        key: new PluginKey("amlOutline"),
        view(view) {
          push(view);
          return {
            update(v, prev) {
              if (v.state.doc !== prev.doc || v.state.selection.from !== prev.selection.from)
                push(v);
            },
            destroy() {
              useOutlineStore.getState().release(token);
            },
          };
        },
      }),
    ];
  },
});
