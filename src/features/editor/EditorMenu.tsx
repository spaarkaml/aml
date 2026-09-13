import { useDiagramStore } from "@/features/diagram/store";
import { ContextMenu, type MenuItem } from "@/features/folio/ContextMenu";
import { useEditorMenuStore } from "./contextMenu";
import { useEditorStore } from "./store";

/**
 * The editor's right-click menu. Today it is the way into the diagram editor, which is what
 * WP-7.1 needed it for; it is the obvious place for anything else that acts on what is under
 * the pointer rather than on the selection.
 */
export function EditorMenu() {
  const menu = useEditorMenuStore((s) => s.menu);
  const close = useEditorMenuStore((s) => s.closeMenu);
  const notePath = useEditorStore((s) => s.path);

  if (!menu || !notePath) return null;

  const isSvg = !!menu.src && /\.svg$/i.test(menu.src);
  const items: MenuItem[] = isSvg
    ? [
        {
          label: "Edit diagram",
          run: () => {
            if (menu.src) void useDiagramStore.getState().edit(notePath, menu.src);
          },
        },
      ]
    : [
        {
          label: "Insert diagram",
          run: () => useDiagramStore.getState().create(notePath),
        },
      ];

  return <ContextMenu x={menu.x} y={menu.y} items={items} onClose={close} />;
}
