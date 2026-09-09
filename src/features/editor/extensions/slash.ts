import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { useSlashStore } from "../slashStore";

interface Range {
  from: number;
  query: string;
}

const KEY = new PluginKey<Range | null>("amlSlashMenu");

/**
 * Detects `/` typed at the start of a paragraph (or after a space) and keeps the query in
 * `useSlashStore` while the caret stays behind it. The React `SlashMenu` renders and applies
 * items; this plugin only tracks the range and forwards navigation keys.
 */
export const SlashMenu = Extension.create({
  name: "slashMenu",

  addProseMirrorPlugins() {
    return [
      new Plugin<Range | null>({
        key: KEY,
        state: {
          init: () => null,
          apply(tr, prev, _old, state) {
            if (tr.getMeta(KEY) === "dismiss") return null;
            const { selection } = state;
            if (!selection.empty) return null;
            const $from = selection.$from;
            if ($from.parent.type.name !== "paragraph") return null;
            const text = $from.parent.textBetween(0, $from.parentOffset, "\n", "\n");
            const idx = text.lastIndexOf("/");
            if (idx === -1) return null;
            if (idx > 0 && !/\s/.test(text[idx - 1] ?? "")) return null;
            const query = text.slice(idx + 1);
            if (/\s/.test(query) || query.length > 30) return null;
            const from = $from.start() + idx;
            // Open only on typing; merely moving the caret behind an existing "/" does nothing.
            if (!prev && !tr.docChanged) return null;
            if (prev && prev.from !== from && !tr.docChanged) return null;
            return { from, query };
          },
        },
        view() {
          return {
            update(view) {
              const range = KEY.getState(view.state) ?? null;
              const store = useSlashStore.getState();
              if (!range) {
                if (store.active) store.set({ active: false, query: "" });
                return;
              }
              const coords = view.coordsAtPos(range.from);
              store.set({
                active: true,
                from: range.from,
                query: range.query,
                left: coords.left,
                bottom: coords.bottom,
                index: range.query === store.query ? store.index : 0,
              });
            },
            destroy() {
              useSlashStore.getState().set({ active: false, query: "" });
            },
          };
        },
        props: {
          handleKeyDown(view, event) {
            if (!KEY.getState(view.state)) return false;
            const store = useSlashStore.getState();
            switch (event.key) {
              case "ArrowDown":
              case "ArrowUp":
                store.set({ index: store.index + (event.key === "ArrowDown" ? 1 : -1) });
                return true;
              case "Enter":
                window.dispatchEvent(new CustomEvent("aml:slash-apply"));
                return true;
              case "Escape":
                view.dispatch(view.state.tr.setMeta(KEY, "dismiss"));
                return true;
              default:
                return false;
            }
          },
        },
      }),
    ];
  },
});
