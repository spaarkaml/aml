import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { useTagsStore } from "@/features/tags/store";

/** Clicking a `#tag` chip in the editor opens the Tags view on that tag (WP-2.4). */
export const TagClicks = Extension.create({
  name: "tagClicks",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("amlTagClicks"),
        props: {
          handleClickOn(_view, _pos, node) {
            if (node.type.name !== "tag") return false;
            useTagsStore.getState().show(String(node.attrs.name ?? "").toLowerCase());
            return true;
          },
        },
      }),
    ];
  },
});
