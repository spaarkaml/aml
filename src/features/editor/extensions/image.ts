import Image from "@tiptap/extension-image";
import { resolveDisplaySrc } from "../assets";
import { useEditorStore } from "../store";

/**
 * Image node whose DOM src is resolved through the asset protocol while the document keeps the
 * note-relative markdown path in `attrs.src`.
 */
export const AmlImage = Image.extend({
  addNodeView() {
    return ({ node }) => {
      const img = document.createElement("img");
      img.className = "aml-image";
      img.alt = String(node.attrs.alt ?? "");
      if (node.attrs.title) img.title = String(node.attrs.title);
      img.setAttribute("data-src", String(node.attrs.src ?? ""));
      let current = String(node.attrs.src ?? "");
      const apply = (src: string) => {
        const notePath = useEditorStore.getState().path;
        resolveDisplaySrc(notePath, src).then((url) => {
          if (current === src) img.src = url;
        });
      };
      apply(current);
      return {
        dom: img,
        update(updated) {
          if (updated.type.name !== "image") return false;
          const src = String(updated.attrs.src ?? "");
          img.alt = String(updated.attrs.alt ?? "");
          if (src !== current) {
            current = src;
            img.setAttribute("data-src", src);
            apply(src);
          }
          return true;
        },
      };
    };
  },
}).configure({ inline: true, allowBase64: false });
