import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { useEditorMenuStore } from "../contextMenu";

/**
 * The editor's right-click menu (WP-7.1).
 *
 * It stands aside for a misspelled word explicitly rather than by being registered later:
 * plugin order decides which handler sees a DOM event first, and depending on it would make
 * the spelling menu disappear the day somebody reorders the extension list.
 */
export const AmlContextMenu = Extension.create({
  name: "amlContextMenu",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("amlContextMenu"),
        props: {
          handleDOMEvents: {
            contextmenu(_view, event) {
              const target = event.target as HTMLElement | null;
              if (target?.closest?.(".aml-misspelled")) return false;
              const image = target?.closest?.("img.aml-image");
              const src =
                image instanceof HTMLElement ? (image.getAttribute("data-src") ?? null) : null;
              event.preventDefault();
              useEditorMenuStore.getState().openMenu({
                x: event.clientX,
                y: event.clientY,
                src,
              });
              return true;
            },
          },
        },
      }),
    ];
  },
});
