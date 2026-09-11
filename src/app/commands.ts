import { useAppearanceStore } from "@/features/appearance/store";
import { useBoundingsStore } from "@/features/boundings/store";
import { useKeymapStore } from "@/features/commands/keymapStore";
import { usePaletteStore } from "@/features/commands/paletteStore";
import { type Command, commandRegistry } from "@/features/commands/registry";
import { useDailyStore } from "@/features/daily/store";
import { BLOCK_ITEMS } from "@/features/editor/blocks";
import { getActiveEditor } from "@/features/editor/editorRef";
import { insertFootnote } from "@/features/editor/footnotes";
import { useEditorStore } from "@/features/editor/store";
import { useBrowserStore } from "@/features/folio/browserStore";
import { activeDir, useFolioStore } from "@/features/folio/store";
import { useIndexStore } from "@/features/index/store";
import { useLayoutStore } from "@/features/layout/store";
import { useOutlineStore } from "@/features/outline/store";
import { useQuickOpenStore } from "@/features/quickopen/store";
import { useSearchStore } from "@/features/search/store";
import { useSettingsStore } from "@/features/settings/store";
import { useSpellStore } from "@/features/spell/store";
import { useSyncStore } from "@/features/sync/store";
import { useTabsStore } from "@/features/tabs/store";
import { useTagsStore } from "@/features/tags/store";
import { useWritingStore } from "@/features/writing/store";

/** Single source of truth for shell shortcuts; the e2e suite presses each one. */
export const SHORTCUTS = {
  palette: "mod+k",
  layout: "mod+shift+l",
  leftPanel: "mod+shift+e",
  rightPanel: "mod+shift+i",
  mode: "mod+shift+m",
  save: "mod+s",
  closeTab: "mod+w",
  nextTab: "mod+alt+arrowright",
  prevTab: "mod+alt+arrowleft",
  back: "mod+[",
  forward: "mod+]",
  newNote: "mod+n",
  quickOpen: "mod+o",
  search: "mod+shift+f",
  today: "mod+shift+d",
  rename: "f2",
  shortcuts: "mod+/",
  focus: "mod+alt+d",
  typewriter: "mod+alt+t",
  zen: "mod+alt+z",
  settings: "mod+,",
  appearance: "mod+alt+,",
  overview: "mod+shift+h",
} as const;

function activeTab(): string | null {
  return useTabsStore.getState().current().active;
}

const TAB_COMMANDS: Command[] = [
  {
    id: "note.quickOpen",
    title: "Quick Open…",
    group: "Note",
    shortcut: SHORTCUTS.quickOpen,
    global: true,
    run: () => {
      if (!useFolioStore.getState().folio) return;
      usePaletteStore.getState().setOpen(false);
      useQuickOpenStore.getState().toggle();
    },
  },
  {
    id: "tab.close",
    title: "Close Tab",
    group: "Note",
    shortcut: SHORTCUTS.closeTab,
    global: true,
    run: () => {
      const p = activeTab();
      if (p) useTabsStore.getState().close(p);
    },
  },
  {
    id: "tab.next",
    title: "Next Tab",
    group: "Note",
    shortcut: SHORTCUTS.nextTab,
    global: true,
    run: () => useTabsStore.getState().cycle(1),
  },
  {
    id: "tab.previous",
    title: "Previous Tab",
    group: "Note",
    shortcut: SHORTCUTS.prevTab,
    global: true,
    run: () => useTabsStore.getState().cycle(-1),
  },
  {
    id: "nav.back",
    title: "Go Back",
    group: "Note",
    shortcut: SHORTCUTS.back,
    global: true,
    run: () => useTabsStore.getState().goBack(),
  },
  {
    id: "nav.forward",
    title: "Go Forward",
    group: "Note",
    shortcut: SHORTCUTS.forward,
    global: true,
    run: () => useTabsStore.getState().goForward(),
  },
  ...Array.from({ length: 9 }, (_, i) => ({
    id: `tab.go.${i + 1}`,
    title: i === 8 ? "Go to Last Tab" : `Go to Tab ${i + 1}`,
    group: "Note",
    shortcut: `mod+${i + 1}`,
    global: true,
    hidden: true,
    run: () => useTabsStore.getState().activateIndex(i + 1),
  })),
  {
    id: "note.new",
    title: "New Note",
    group: "Note",
    shortcut: SHORTCUTS.newNote,
    global: true,
    run: () => void useFolioStore.getState().createNote(activeDir()),
  },
  {
    id: "folder.new",
    title: "New Folder",
    group: "Folio",
    run: () => void useFolioStore.getState().createFolder(activeDir()),
  },
  {
    id: "note.rename",
    title: "Rename Note",
    group: "Note",
    shortcut: SHORTCUTS.rename,
    global: true,
    run: () => {
      const p = activeTab();
      if (!p) return;
      useBrowserStore.getState().reveal(p);
      useLayoutStore.getState().setLeftView("folio");
      useLayoutStore.getState().openPanel("left");
      useBrowserStore.getState().startRename(p);
    },
  },
  {
    id: "note.trash",
    title: "Move Note to Trash…",
    group: "Note",
    run: () => {
      const p = activeTab();
      if (p) void useFolioStore.getState().trash(p);
    },
  },
  {
    id: "note.reveal",
    title: "Reveal Note in Browser",
    group: "Note",
    run: () => {
      const p = activeTab();
      if (!p) return;
      useBrowserStore.getState().reveal(p);
      useLayoutStore.getState().setLeftView("folio");
      useLayoutStore.getState().openPanel("left");
    },
  },
];

/**
 * Every block the `/` menu offers is also a palette command, so one search field reaches
 * all of them. They carry no default shortcut: inside the editor those keys are Tiptap's
 * (see the Keyboard Shortcuts dialog), and two owners for one key would fight.
 */
export const BLOCK_COMMANDS: Command[] = BLOCK_ITEMS.map((item) => ({
  id: `format.${item.id}`,
  title: item.title,
  group: "Format",
  run: () => {
    const editor = getActiveEditor();
    if (editor) item.run(editor);
  },
}));

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
    // Acts on the editor, so it has to work while the caret is in it.
    global: true,
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
    id: "folio.close",
    title: "Close Folio",
    group: "Folio",
    run: () => {
      void useEditorStore
        .getState()
        .close()
        .then(() => useFolioStore.getState().close());
    },
  },
  ...TAB_COMMANDS,
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
    id: "sync.setup",
    title: "NAS Sync…",
    group: "Folio",
    run: () => useSyncStore.getState().setOpen(true),
  },
  {
    id: "bounding.new",
    title: "New Bounding…",
    group: "Folio",
    run: () => {
      useBoundingsStore.getState().show();
      useBoundingsStore.getState().startDraft();
    },
  },
  {
    id: "bounding.show",
    title: "Show Boundings",
    group: "View",
    run: () => useBoundingsStore.getState().show(),
  },
  {
    id: "daily.today",
    title: "Today's Daily Note",
    group: "Note",
    shortcut: SHORTCUTS.today,
    global: true,
    run: () => void useDailyStore.getState().openToday(),
  },
  {
    id: "daily.show",
    title: "Show Daily Notes",
    group: "View",
    run: () => useDailyStore.getState().show(),
  },
  {
    id: "outline.show",
    title: "Show Outline",
    group: "View",
    run: () => useOutlineStore.getState().show(),
  },
  {
    id: "outline.up",
    title: "Move Section Up",
    group: "Note",
    shortcut: "mod+shift+arrowup",
    global: true,
    run: () => void useOutlineStore.getState().step(-1),
  },
  {
    id: "outline.down",
    title: "Move Section Down",
    group: "Note",
    shortcut: "mod+shift+arrowdown",
    global: true,
    run: () => void useOutlineStore.getState().step(1),
  },
  {
    id: "search.show",
    title: "Search Folio",
    group: "View",
    shortcut: SHORTCUTS.search,
    global: true,
    run: () => useSearchStore.getState().show(),
  },
  {
    id: "tags.show",
    title: "Show Tags",
    group: "View",
    run: () => useTagsStore.getState().show(null),
  },
  {
    id: "note.backlinks",
    title: "Show Backlinks",
    group: "Note",
    run: () => useLayoutStore.getState().openPanel("right"),
  },
  {
    id: "note.undoRename",
    title: "Undo Last Rename",
    group: "Note",
    run: () => void useFolioStore.getState().undoRename(),
  },
  {
    id: "index.rebuild",
    title: "Rebuild Index",
    group: "Folio",
    run: () => void useIndexStore.getState().rebuild(),
  },
  {
    id: "spell.toggle",
    title: "Toggle Spell Check (en-AU)",
    group: "View",
    run: () => useSpellStore.getState().toggle(),
  },
  {
    id: "shortcuts.open",
    title: "Keyboard Shortcuts…",
    group: "View",
    shortcut: SHORTCUTS.shortcuts,
    global: true,
    run: () => useKeymapStore.getState().setOpen(true),
  },
  {
    id: "writing.focus",
    title: "Focus Mode (Off / Paragraph / Sentence)",
    group: "View",
    shortcut: SHORTCUTS.focus,
    global: true,
    run: () => useWritingStore.getState().cycleFocus(),
  },
  {
    id: "writing.typewriter",
    title: "Typewriter Mode",
    group: "View",
    shortcut: SHORTCUTS.typewriter,
    global: true,
    run: () => useWritingStore.getState().toggleTypewriter(),
  },
  {
    id: "writing.zen",
    title: "Zen Mode",
    group: "View",
    shortcut: SHORTCUTS.zen,
    global: true,
    run: () => useWritingStore.getState().toggleZen(),
  },
  {
    id: "settings.open",
    title: "Settings…",
    group: "View",
    shortcut: SHORTCUTS.settings,
    global: true,
    run: () => useSettingsStore.getState().setOpen(true),
  },
  {
    id: "view.overview",
    title: "Go to Overview",
    group: "View",
    shortcut: SHORTCUTS.overview,
    global: true,
    run: () => useTabsStore.getState().showOverview(),
  },
  {
    id: "appearance.settings",
    title: "Appearance…",
    group: "View",
    shortcut: SHORTCUTS.appearance,
    global: true,
    run: () => useAppearanceStore.getState().setOpen(true),
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
  if (!registered) registered = commandRegistry.register(...SHELL_COMMANDS, ...BLOCK_COMMANDS);
  if (import.meta.env.DEV) {
    // Exposed for e2e only: the suite reads the keymap to press every shortcut in it.
    (window as unknown as { __amlCommands?: typeof commandRegistry }).__amlCommands =
      commandRegistry;
  }
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
