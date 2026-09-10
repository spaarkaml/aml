import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { useLinkStore } from "@/features/links/store";

interface Range {
  from: number;
  query: string;
}

const KEY = new PluginKey<Range | null>("amlLinkMenu");

/**
 * Tracks an unfinished `[[query` before the caret and publishes it to `useLinkStore`; the
 * React `LinkMenu` lists notes and inserts the chosen link. Navigation keys are forwarded
 * only while the menu has rows, so Enter still breaks the line when nothing matches.
 */
export const LinkMenu = Extension.create({
  name: "linkMenu",

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
            if ($from.parent.type.name === "codeBlock") return null;
            const text = $from.parent.textBetween(0, $from.parentOffset, "\n", "\n");
            const idx = text.lastIndexOf("[[");
            if (idx === -1) return null;
            const query = text.slice(idx + 2);
            if (query.includes("]]") || query.includes("\n") || query.length > 80) return null;
            const from = $from.start() + idx;
            if (!prev && !tr.docChanged) return null;
            if (prev && prev.from !== from && !tr.docChanged) return null;
            return { from, query };
          },
        },
        view() {
          return {
            update(view) {
              const range = KEY.getState(view.state) ?? null;
              const store = useLinkStore.getState();
              if (!range) {
                if (store.active) store.set({ active: false, query: "", count: 0 });
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
              useLinkStore.getState().set({ active: false, query: "", count: 0 });
            },
          };
        },
        props: {
          handleKeyDown(view, event) {
            if (!KEY.getState(view.state)) return false;
            const store = useLinkStore.getState();
            if (store.count === 0) return false;
            switch (event.key) {
              case "ArrowDown":
              case "ArrowUp":
                store.set({ index: store.index + (event.key === "ArrowDown" ? 1 : -1) });
                return true;
              case "Enter":
              case "Tab":
                window.dispatchEvent(new CustomEvent("aml:link-apply"));
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
