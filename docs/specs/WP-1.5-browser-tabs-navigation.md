# WP-1.5 — Folio Browser, tabs and navigation
**Stage:** 1 · **Depends on:** 1.1, 1.2 · **ADRs:** 004, 011 · **Sessions:** 1.5

## Goal
Make moving between notes effortless (the user's stated priority for the layout): tabs per Folio, back/forward history, a breadcrumb, and a Folio Browser that can create, rename, move and trash entries without leaving the app.

## Design
- **Tabs (`src/features/tabs/store.ts`):** per-Folio `{ tabs, active }` persisted per device in `aml.tabs` (ADR-004: never inside the Folio). One editor instance follows the active tab; switching tabs saves the previous note through the normal autosave path, so there is no per-tab dirty state. Back/forward stacks (max 50) are session-only. `rename` remaps tab paths after a rename or folder move; `closeWithin` drops tabs under a trashed folder.
- **Sync (`useTabsSync`):** mounted once in `App`. Folio root → `setFolio`; active tab → `useEditorStore.open`. A tab whose note no longer exists is closed silently (its neighbour activates). Tabs are restored when the same Folio is opened again.
- **Top bar:** `TabStrip` (click, middle-click closes, unsaved dot, duplicate titles get their parent folder as a hint) and `Breadcrumb` (`Folio › folder › note`; folder crumbs reveal the folder in the Browser and open the panel).
- **Browser (`FolioTree.tsx`):** `+ Note` / `+ Folder` toolbar; right-click context menu (New Note / New Folder on folders; Rename; Move to Trash…); inline rename (Enter commits, Escape cancels, blur commits; `/` and `\` are replaced); HTML5 drag-move of notes/folders onto folders or the empty Browser area (root); expanded folders persisted per Folio in `aml.browser`; the open note is highlighted and shows an unsaved dot. Trash always goes through the OS trash after a native confirm dialog (`dialog:allow-message`).
- **Folio store actions:** `createNote(dir)` (next free `Untitled N.md`, opens it and starts a rename), `createFolder(dir)`, `rename(from, to)` (saves a dirty open note first; remaps editor, tabs and Browser state), `trash(path)`.
- **Editor:** `renamed(from, to)` keeps following a renamed file. `noteChangedOnDisk` now ignores the app's own writes (save in flight, or on-disk mtime equals the known mtime) so autosave no longer remounts the editor. The mount-time focus is skipped when a text field (the rename box) already has focus.
- **Commands:** Close Tab ⌘W, Next/Previous Tab ⌘⌥→/←, Go Back ⌘[, Go Forward ⌘], Go to Tab ⌘1–9 (hidden from the palette), New Note ⌘N (beside the active note), New Folder, Rename Note F2, Move Note to Trash…, Reveal Note in Browser.
- **macOS menu:** a custom menu bar replaces Tauri's default so ⌘W closes a tab instead of the window; the Edit menu is kept because webview clipboard shortcuts route through it on macOS. Windows keeps no menu bar.
- **Dependencies:** none added.

## Acceptance criteria
- [x] Open two notes → two tabs; click switches editor and breadcrumb (e2e).
- [x] ⌘W closes the active tab and activates its neighbour; last close shows the placeholder (e2e).
- [x] ⌘[ / ⌘] walk history; ⌘3 and ⌘⌥→ jump/cycle (e2e).
- [x] Tabs restored on reopening the Folio (e2e).
- [x] `+ Note` → Untitled opened + inline rename → renamed file on disk, tab and breadcrumb follow (e2e).
- [x] Context menu: new note in folder, rename, trash (closes tab, removes from tree) (e2e).
- [x] Drag a note onto a folder → moved; tab follows (e2e).
- [x] Expanded state persists across reload (e2e).
- [ ] Real app: ⌘W closes a tab (not the window) on macOS; trash confirm shows; drag-move works with the native webview. *(Manual, `qa/stage-1.md`.)*

## Lessons recorded
- `@tauri-apps/plugin-dialog` `confirm()` invokes `plugin:dialog|message` and compares the result with its OK label — the dev mock must return that label, and the capability needs `dialog:allow-message`.
- The Rust watcher reports the app's own atomic writes; the editor must recognise them (mtime match) or every autosave reloads the note.
