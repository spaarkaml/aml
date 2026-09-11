# Changelog

All notable changes. Format: one entry per work package.

## Unreleased

### WP-3.10 — Home, a three-tab Browser, and Settings (2026-09-11)
- **The Overview is a place you can go.** The root breadcrumb — which was the Folio's name, saying what the window title already says — is now Home. It shows the Overview without closing a thing: your tabs stay open and `⌘[` returns you to what you were writing. Also `⌘⇧H` and *Go to Overview* in the palette.
- **The Browser has three tabs, on one line: Folio, Boundings, Search.** Five never fit a 260px panel, and the two-row control read as two controls. Nothing was lost — each of the other two moved next to what it is reached from, which is one fewer tab *and* one fewer click:
  - **Tags** are at the foot of the Search view. A tag is a way of searching.
  - **The week** is the tray at the foot of the Folio view, sticky, so it stays in reach however far the tree is scrolled — the strip and one button, **Open today's note**. The list of recent Dailies went: every one is a note in the tree just above it, and the Overview already lists what you were last writing.
  - Search is the magnifier rather than the word; a device left on Tags or Daily is migrated to the tab that holds them now.
- **Settings (`⌘,`)**, with a button in the toolbar. Appearance keeps its own screen — it is long and it previews live — and Settings links to it, to NAS Sync and to the shortcuts dialog, so there is one door to all of them. Appearance's own key moves to `⌥⌘,`.
- **You choose where Daily notes go.** `journal/YYYY/…` was hard-coded; the folder is now a setting, saved in the Folio (`daily.folder` in `.aml/config.yaml`) so both machines write to the same place — a per-device answer would leave the two calendar strips disagreeing. What you type is tidied, anything that would leave the Folio is refused and said so on screen, and notes already written are left where they are. The strip and its dots read the folder you chose.
- `config.rs` gained `Preferences` alongside `Appearance`: same shape, same file, each keeping the other's settings intact.

### Drag-and-drop actually works, and a note asks where it belongs (2026-09-11)
- **Dragging a note onto a folder now works in the app.** The code and its e2e test had been there since WP-1.1 and passed in the browser — two things stopped it reaching the desktop. Tauri installs an OS file-drop handler on the webview by default (`dragDropEnabled`), which swallows HTML5 drag events; AML accepts no dropped files from the desktop, so it is now off. And WebKit refuses to begin a drag from a `<button>` on `draggable` alone, which is why macOS was silent while every other engine was fine — the tree rows now carry `-webkit-user-drag: element`.
- **A note in no Bounding is offered one**, as a floating capsule centred at the top of the page: a chip per Bounding in its own colour, click to file it. It never appears when there are no Boundings to offer, nor on a note that already has one, and dismissing it lasts while that note is open.

### Launch into your last Folio, and honest sync progress (2026-09-11)
- **AML reopens the Folio you were last in.** The Welcome screen is now what it says it is — a first run. After that, launch lands you in your work; `folio.open` in the palette (⌘K → "Open Folio…") is the way to another one, and *Close Folio* brings Welcome back with your recent list. A Folio that has moved or been deleted falls through to Welcome with the reason on screen.
- The shell renders nothing in the centre until it has decided where to land, so there is no flash of a screen you were not meant to see again.
- **Sync now says what it is doing.** One "NAS offline" used to cover three different waits. The status bar now distinguishes *Starting sync…* (the sidecar booting), *Finding the NAS…* (device not connected yet — Syncthing can take most of a minute over global discovery or a relay), *NAS offline* (still nothing after 60 s), *No NAS paired*, *Syncing n%*, *Scanning…* and *NAS · up to date*.
- Sync is polled **from launch**, not from the first Folio you open, so the wait is visible while it is happening.
- `sync_status` no longer queues behind the sidecar's start. `Syncthing::start` blocks for up to 20 s holding the sidecar lock, so every status poll during launch waited on it — the status bar was blank for exactly as long as the user most wanted to be told something was happening. `SyncStatus` gained a `starting` flag and the command answers from it without taking the lock.

### Release workflow (2026-09-11)
- `.github/workflows/release.yml`: builds the DMG (Apple silicon) and the MSI + NSIS installer (Windows x64) and attaches them to a **draft** GitHub Release on a `v*` tag. `workflow_dispatch` builds the same installers as artifacts without making a release, which is the way to get an MSI without tagging.
- The tag is checked against `tauri.conf.json`'s version before anything is built: a release page whose installers claim a different version is worse than no release.
- Release notes carry the unsigned-build instructions for both OSes (ADR-012).
- Part of WP-8.1, pulled forward because the MSI cannot be built on the Mac.

### Fix — the phantom "changed on disk" banner (2026-09-11)
- **Removed** the *"This note changed on disk while you were editing"* warning. It was raised from a watcher event alone, and AML's own atomic save trips the watcher exactly as a foreign edit does — with the watcher's 300 ms debounce landing after the save finished and you still typing, it fired roughly every 1.3 seconds of normal writing. Its *Reload from disk* button silently discarded everything typed since the last save, so a false alarm offered a data-losing button.
- The guard that actually protects you is unchanged: every save sends the mtime it read, and `Folio::write_note` refuses to write over a file that has moved. That refusal is what raises the conflict banner now — checked against the file, never guessed from an event.
- That banner's buttons now say what they do: **Discard mine and reload** / **Keep mine and overwrite**.
- A clean note still reloads silently when the disk changes, after comparing mtimes. Unchanged.
- Not done, and why: suppressing our own writes in the Rust watcher would have been wrong. Tags, links, backlinks and Quick Open all need to hear about a save — it is the editor alone that should ignore its own writes.

### WP-3.0 — Visual refresh, Apple-light (2026-09-11)
- **The whole shell was rebuilt on one decided foundation** (ADR-013, chosen from a canvas of three directions): the system interface face instead of Arial, a 11→34px type ramp instead of one flat 11–12px, an 8-point spacing rhythm, four corner radii instead of 4px everywhere, elevation instead of 1px walls, and 120/180/240 ms motion with a single `prefers-reduced-motion` rule that zeroes it.
- **Paper is neutral now** — `#f5f5f7` chrome on a white page. AML's teal and coral keep their jobs; the warm rose ground does not. Ink is unchanged and still awaiting its Gate 0 approval.
- **Icons are drawn** (`src/app/icons.tsx`): a 16px, 1.3px-stroke, `currentColor` set replacing the typed ◧ ◨ ↺ ✎ ▸ ▾ ‹ › × and the 8px ● dirty marker. Keyboard glyphs (⌘ ⌥ ⇧ ⌃) stay as characters.
- Secondary and tertiary text are tokens derived from `--aml-text`, so `opacity` no longer stands in for a text colour — which is why hover and focus used to look broken on muted rows.
- Three unit tests keep it that way: no stylesheet may name a colour, a raw radius or a raw font size of its own, and the Appearance defaults must equal `tokens.css` so *Reset to AML* restores what the app really falls back to.
- Screenshots refreshed by `node scripts/screens.mjs` (Paper and Ink, 2×).

### WP-3.2 — Appearance settings (2026-09-11)
- **Appearance** (`⌘,`, palette): Paper / Ink / follow-the-OS, every ADR-010 colour token with a picker, a hex field and live preview, per-token and per-mode reset, and a live WCAG contrast score on the text colours.
- Type: editor and interface face, measure, leading and paragraph spacing.
- Saved to `.aml/config.yaml` in the Folio so they follow you between machines; **Keep this machine's own appearance** overrides them on one device without changing the Folio's.
- Bundled faces (Source Serif 4, Literata, EB Garamond, IBM Plex Mono) are fetched by `pnpm fonts:fetch`, not committed, SIL OFL 1.1 with the licence beside each file.
- Commands `appearance_read` / `appearance_write`.

### WP-3.1 — Focus, Typewriter and Zen (2026-09-11)
- **Focus Mode** (`⌘⌥D`, cycles off → paragraph → sentence): dims everything but the block — or the sentence — the caret is in. Sentence detection keeps decimals, file names, "e.g." and "p. 41" whole.
- **Typewriter Mode** (`⌘⌥T`): holds the line you are typing at a fixed height on the page.
- **Zen** (`⌘⌥Z`): the page and nothing else; Escape leaves, and the palette still works inside it.
- All three are per device and remembered; status-bar chips show the active ones and turn them off.

### WP-2.9 — Command Palette complete and rebindable (2026-09-11)
- Every `/` block is now a palette command too (group **Format**), from the same list the slash menu reads.
- **Keyboard Shortcuts** dialog (`⌘/`, palette): every command with its key, click to record a new one, ↺ for the default, *Reset all*, and a filter. A key another command already holds is refused by name rather than quietly winning.
- Rebindings are per device (`aml.keymap`) and survive a restart; `mod` records as ⌘ on macOS and Ctrl on Windows, so a binding means the same on both.
- **Insert Footnote** now works while the caret is in the editor (`⌘⌥F` did nothing there before).
- The e2e suite presses every bound shortcut and checks the command that ran is the one that owns it.

### WP-2.8 — Boundings and the Overview (2026-09-11)
- **Boundings** (ADR-011): virtual, many-to-many groups of notes kept in `.aml/boundings.yaml` inside the Folio, one note per line so synced copies merge cleanly. Colour, icon and name; a note can be in as many as you like.
- Boundings panel (fifth left-panel view): create, rename, recolour, delete, add or remove the open note with `+`/`−`, and list a Bounding's notes. Each Bounding is also a palette command, "Add to Bounding: …".
- Membership follows the note: renaming or moving a note (or a folder above it) keeps it in its Boundings, and trashing it takes it out.
- `bounding:Academic` searches now match (the field was reserved in WP-2.5).
- **Overview** replaces the placeholder home screen: the Folio and its size, this week's Dailies, Bounding and Project tiles, and recent notes.
- Command `boundings_list` / `bounding_create` / `bounding_update` / `bounding_delete` / `bounding_add` / `bounding_remove` / `projects_list`.
- Jumping to a heading (Quick Open, backlinks, search, a Bounding) now focuses the editor itself, so typing lands where the caret went.
- Which list the left panel shows is now layout state (it had been living in the tags store); **Rename Note** and **Reveal Note in Browser** now switch to the Browser view, not just open the panel.

### WP-2.7 — Templates and Daily notes (2026-09-10)
- Templates in `_templates/` with `{{title}}`, `{{date}}`, `{{time}}`, `{{yesterday}}` and `{{tomorrow}}` placeholders, each date one taking a format (`{{date:dddd D MMMM YYYY}}`); an unknown placeholder is left exactly as written. Every template becomes a palette command ("New Scene Note").
- Daily notes at `journal/YYYY/YYYY-MM-DD.md`: `⌘⇧D` / **Today's Daily Note** opens today's, creating it from `_templates/daily.md` (or a built-in default) the first time.
- Left panel gains a Daily view: a Monday-first week strip with today outlined and a dot on days that have a note, arrows to page weeks, and recent Dailies.
- Commands `templates_list` / `note_from_template` / `daily_note` / `daily_dates`.
- Command Palette fixes: the selection returns to the top match as you type (hovering the list could leave it on a row the new query did not list, so Enter ran the wrong command or none), the query is reset on close rather than on open, and Enter acts on what the field holds.

### WP-2.6 — Outline (2026-09-10)
- Context panel gains an Outline: the open note's headings, indented by level, with the caret's section highlighted; click to jump.
- Drag a row to move a whole section (subheadings and content included) elsewhere in the note, or use **Move Section Up / Down** (`⌘⇧↑` / `⌘⇧↓`); one undo step either way.
- Built from the live editor document, so it follows unsaved edits.

### WP-2.5 — Search (2026-09-10)
- Search is the third left-panel view (`⌘⇧F`, palette **Search Folio**): marked excerpts in context with their section, click a line to open the note there.
- Query language over the index: word-start words, `"phrases"`, `/regex/flags`, `-exclusions`, `OR`, `(groups)`, and fields `path: file: title: tag: has: bounding:` plus any front-matter property. A half-typed query just matches less; only a bad regex reports an error.
- **Replace in this note** rewrites the query's text matches in the open note (code spans untouched).
- Command `search_query`.

### WP-2.4 — Tags (2026-09-10)
- Left panel gains a Folio / Tags switch: tag hierarchy with note counts, click a tag to list and open its notes; clicking a `#tag` chip in a note jumps there; palette **Show Tags**.
- Commands `tags_list` / `tag_notes`.

### WP-2.3 — Backlinks and unlinked mentions (2026-09-10)
- Context panel (right side, ⌘⇧I) now holds Properties and Backlinks: linked mentions with line, context and section (click to jump), unlinked mentions with *Link* / *Link all*.
- Commands `backlinks` / `unlinked_mentions` / `link_mention_apply`; palette **Show Backlinks**.
- Index status polling ignores stale answers (fixes a rebuild-progress race).

### WP-2.2 — Links (2026-09-10)
- `[[` note picker in the editor (titles, aliases, `#` headings, "link to new note"); click a wiki link or a `.md` link to open it, or create the note when it does not exist; links that point nowhere are dashed.
- Rename propagation: renaming or moving a note or folder previews every link that would change and rewrites them after the move; **Undo Last Rename** in the palette.
- Commands `link_resolve` / `link_rename_preview` / `link_rename_apply` on the SQLite index.

### WP-2.1 — Index (2026-09-10)
- SQLite FTS5 index per Folio in local app-data (`src-tauri/src/index/`): notes, aliases, headings, tags, links, front-matter properties and full text; built on a thread with progress, kept current by the watcher, `Rebuild Index` in the palette; 5,000 notes in under a second.
- Commands `index_status` / `index_rebuild` / `index_search`; event `index-progress`; `folio_index` (Quick Open) now reads from SQLite.
- Status bar shows `Indexing n / total` while a build runs.

### WP-1.1b — Syncthing sidecar (2026-09-10)
- Bundled Syncthing (pinned v2.1.5, fetched by `pnpm sidecar:fetch`) managed by `sidecar::syncthing`: start on launch when enabled, stop on exit, LAN-only defaults.
- NAS sync screen: turn on, show/copy Device ID, add the NAS, accept offered folders into a chosen local folder and open them as a Folio, or share the open Folio; sync log.
- Status bar shows sync state for the open Folio.

### WP-1.7 — Australian English spell check (2026-09-10)
- Bundled SCOWL en_AU Hunspell dictionary checked in Rust (`spellbook`); commands `spell_check` / `spell_suggest` / `spell_add` / `spell_ignore`.
- Wavy underlines in the editor with a right-click menu (suggestions, add to `.aml/dictionary.txt`, ignore); code, links, front matter, atoms and acronyms are skipped.
- Status-bar toggle and palette command; setting persisted per device.

### WP-1.4 — Editor ergonomics (2026-09-10)
- Auto-pair for brackets and quotes (skip-over, Backspace clears a pair, wrap or toggle marks on a selection); `[[Note]]` becomes a link while typing.
- `/` block menu (headings, lists, quote, code, table, divider, footnote, note link, date).
- Floating formatting toolbar on selection (bold, italic, strike, code, link, H1–H3).
- E2E helpers that wait for ProseMirror to adopt a mouse-placed caret.

### WP-1.6 — Quick Open (2026-09-10)
- ⌘O Quick Open: fuzzy over titles, front-matter aliases, headings and paths; recents on an empty query; heading match jumps to the heading; "Create note" for unmatched queries.
- Rust `folio_index` command with an mtime-cached in-memory index (`folio/index.rs`).

### WP-1.5 — Folio Browser, tabs and navigation (2026-09-10)
- Tabs per Folio (persisted per device), back/forward history, breadcrumb with reveal-in-Browser; ⌘W / ⌘⌥→← / ⌘[ ] / ⌘1–9.
- Folio Browser: `+ Note` / `+ Folder`, context menu, inline rename, drag-move, OS-trash with confirm, persisted expanded folders, unsaved badge.
- New Note ⌘N, Rename Note F2, Move Note to Trash…, Reveal Note in Browser.
- Editor ignores the watcher echo of its own saves (no more remount after autosave); follows renamed files.
- macOS menu bar without "Close Window" so ⌘W closes a tab.

### WP-1.3 — Images, tables, footnotes, properties (2026-09-10)
- Assets: `asset_write` / `asset_import` / `asset_resolve` commands; per-top-level-folder `assets/`; asset protocol scoped to the Folio; paste/drop images into the editor; `AmlImage` node view.
- Table toolbar (rows/cols/header/delete) and "Insert Table"; "Insert Footnote" (⌘⌥F).
- Properties panel: typed front-matter fields, add/remove, YAML mode; edits go through the guarded front-matter node.
- Editor stability: content frozen at creation per note version; focus after mount; palette commands run after the palette closes.

### WP-1.2 — Editor spike (2026-09-09)
- `src/lib/markdown`: remark-based parse, canonical serialiser with conservative escaping, AML inline syntax, mdast⇄ProseMirror bridge with verbatim Raw nodes. 48-file corpus AST-equal + idempotent.
- Tiptap 3 editor with AML nodes (front matter, raw block/inline, wiki link/embed, tag, cite, footnotes), list `spread`, code `meta`, table `align`.
- Editor store: open, debounced autosave with mtime conflict detection, external-change handling, word count; status bar shows words, reading time, save state.
- Front matter guard plugin; Playwright suite limited to 2 workers for keystroke stability.

### WP-1.1 — Folio basics (2026-09-09)
- Rust `folio` module: create/open, path-safe resolve, tree, read (BOM-stripped), atomic write with mtime conflict check, create/rename/trash, debounced watcher → `FolioChanged`.
- Commands + typed errors exported to TS; native folder picker via tauri-plugin-dialog.
- Welcome screen (open/create/recent, "Make it a Folio"), read-only tree in the Browser, breadcrumb shows the Folio.

### WP-0.4 — Design tokens & contrast (2026-09-09)
- `scripts/contrast-report.mjs` generates `docs/qa/contrast-report.md`; all text pairings ≥ 6.2:1 in both modes.

### WP-0.5 — App shell (2026-09-09)
- Top bar (wordmark, breadcrumb, tab strip placeholder, mode/layout/palette buttons), status bar.
- Side panels: pinned or slide-over, resizable, Escape/backdrop closes overlays.
- Layout store (Desk/Page presets, persisted per device), appearance store (Auto/Paper/Ink).
- Command registry with shortcut grammar, Command Palette with fuzzy search, global shortcut hook.

### WP-0.6 — Test infrastructure (2026-09-09)
- 48-file round-trip corpus with `manifest.json` (lossless / canonicalised / raw expectations) and a guard test.
- Playwright e2e in Chromium against Vite with mocked Tauri IPC (`src/dev-mocks.ts`); 6 shell specs.

### WP-0.2 — Repository scaffold (2026-09-09)
- Tauri 2.11 + React 19 + TypeScript 6 (strict, `noUncheckedIndexedAccess`), Vite 8, pnpm.
- Rust ↔ TS bridge via tauri-specta; `cargo test` regenerates `src/ipc/bindings.ts`.
- Biome lint/format, Vitest + Testing Library, `scripts/check-vocabulary.mjs`.
- Design tokens for Paper and Ink modes in `src/app/tokens.css` (ADR-010).
- First command `app_info`; "Hello Folio" window.

### WP-0.3 — CI (2026-09-09)
- GitHub Actions matrix (macOS, Windows): fmt, clippy, cargo test, bindings-current check, typecheck, lint, vocabulary, unit tests, frontend build, unsigned bundle upload.
