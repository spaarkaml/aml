import { useDiagramStore } from "@/features/diagram/store";
import { ContextMenu, type MenuItem } from "@/features/folio/ContextMenu";
import { useHistoryStore } from "@/features/history/store";
import { useEditorMenuStore } from "./contextMenu";
import { useEditorStore } from "./store";

/**
 * The editor's right-click menu: the way into the diagram editor (WP-7.1), and into the note's
 * History (WP-4.1) — the obvious place for anything that acts on the note rather than on the
 * selection.
 */
export function EditorMenu() {
  const menu = useEditorMenuStore((s) => s.menu);
  const close = useEditorMenuStore((s) => s.closeMenu);
  const notePath = useEditorStore((s) => s.path);

  if (!menu || !notePath) return null;

  const isSvg = !!menu.src && /\.svg$/i.test(menu.src);
  const history: MenuItem = {
    label: "Note History…",
    run: () => void useHistoryStore.getState().show(),
  };
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

  return <ContextMenu x={menu.x} y={menu.y} items={[...items, history]} onClose={close} />;
}
