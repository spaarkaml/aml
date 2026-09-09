import { useAppearanceStore } from "@/features/appearance/store";
import { usePaletteStore } from "@/features/commands/paletteStore";
import { type Command, commandRegistry } from "@/features/commands/registry";
import { getActiveEditor } from "@/features/editor/editorRef";
import { insertFootnote } from "@/features/editor/footnotes";
import { useEditorStore } from "@/features/editor/store";
import { useFolioStore } from "@/features/folio/store";
import { useLayoutStore } from "@/features/layout/store";

/** Single source of truth for shell shortcuts; the e2e suite presses each one. */
export const SHORTCUTS = {
  palette: "mod+k",
  layout: "mod+shift+l",
  leftPanel: "mod+shift+e",
  rightPanel: "mod+shift+i",
  mode: "mod+shift+m",
  save: "mod+s",
} as const;

export const SHELL_COMMANDS: Command[] = [
  {
    id: "folio.open",
    title: "Open Folio…",
    group: "Folio",
    run: () => void useFolioStore.getState().pickAndOpen(),
  },
  {
    id: "folio.create",
    title: "Create Folio…",
    group: "Folio",
    run: () => void useFolioStore.getState().pickAndCreate(),
  },
  {
    id: "note.save",
    title: "Save Note Now",
    group: "Note",
    shortcut: SHORTCUTS.save,
    global: true,
    run: () => void useEditorStore.getState().saveNow(),
  },
  {
    id: "insert.table",
    title: "Insert Table (3 × 3)",
    group: "Insert",
    run: () =>
      getActiveEditor()
        ?.chain()
        .focus()
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run(),
  },
  {
    id: "insert.footnote",
    title: "Insert Footnote",
    group: "Insert",
    shortcut: "mod+alt+f",
    run: () => {
      const e = getActiveEditor();
      if (e) insertFootnote(e);
    },
  },
  {
    id: "insert.image",
    title: "Insert Image…",
    group: "Insert",
    run: () => void pickAndInsertImage(),
  },
  {
    id: "note.close",
    title: "Close Note",
    group: "Note",
    run: () => void useEditorStore.getState().close(),
  },
  {
    id: "folio.close",
    title: "Close Folio",
    group: "Folio",
    run: () => {
      void useEditorStore.getState().close();
      void useFolioStore.getState().close();
    },
  },
  {
    id: "palette.open",
    title: "Show All Commands",
    shortcut: SHORTCUTS.palette,
    global: true,
    run: () => usePaletteStore.getState().toggle(),
  },
  {
    id: "layout.toggle",
    title: "Toggle Layout (Desk / Page)",
    group: "View",
    shortcut: SHORTCUTS.layout,
    global: true,
    run: () => useLayoutStore.getState().toggleLayout(),
  },
  {
    id: "panel.left.toggle",
    title: "Toggle Browser",
    group: "View",
    shortcut: SHORTCUTS.leftPanel,
    global: true,
    run: () => useLayoutStore.getState().togglePanel("left"),
  },
  {
    id: "panel.right.toggle",
    title: "Toggle Context Panel",
    group: "View",
    shortcut: SHORTCUTS.rightPanel,
    global: true,
    run: () => useLayoutStore.getState().togglePanel("right"),
  },
  {
    id: "panel.left.pin",
    title: "Pin / Unpin Browser",
    group: "View",
    run: () => useLayoutStore.getState().togglePinned("left"),
  },
  {
    id: "panel.right.pin",
    title: "Pin / Unpin Context Panel",
    group: "View",
    run: () => useLayoutStore.getState().togglePinned("right"),
  },
  {
    id: "appearance.cycle",
    title: "Appearance: Auto / Paper / Ink",
    group: "View",
    shortcut: SHORTCUTS.mode,
    global: true,
    run: () => useAppearanceStore.getState().cycle(),
  },
];

let registered: (() => void) | null = null;

/** Idempotent — safe under React StrictMode double-invocation and HMR. */
export function registerShellCommands(): () => void {
  if (!registered) registered = commandRegistry.register(...SHELL_COMMANDS);
  return () => {
    registered?.();
    registered = null;
  };
}

async function pickAndInsertImage(): Promise<void> {
  const editor = getActiveEditor();
  const notePath = useEditorStore.getState().path;
  if (!editor || !notePath) return;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const picked = await open({
    multiple: false,
    title: "Insert image",
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg"] }],
  });
  if (typeof picked !== "string") return;
  const { commands } = await import("@/ipc");
  const r = await commands.assetImport(notePath, picked);
  if (r.status === "error") return;
  const alt = (picked.split(/[\\/]/).pop() ?? "image")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_]+/g, " ");
  editor.chain().focus().setImage({ src: r.data.markdownPath, alt }).run();
}
