# WP-1.3 — Images, tables, footnotes, properties panel
**Stage:** 1 · **Depends on:** 1.2 · **ADRs:** 003, 004 · **Sessions:** 1.5

## Goal
The rich blocks a writer needs day one: paste or drop images into the Folio, edit tables in place, add footnotes, and edit front matter without seeing YAML.

## Design
- **Assets (Q12):** `Folio::write_asset` stores files as `<top-level folder>/assets/YYYYMMDD-HHMMSS-<slug>.<ext>` (or `<Folio>/assets/` for root notes); returns the note-relative path used in the markdown. `asset_import` copies a file picked in the native dialog. `asset_resolve` maps a note-relative reference back to an absolute path, guarded against escaping the Folio.
- **Display:** the Tauri asset protocol (`protocol-asset` feature; scope widened to the Folio root on open; CSP allows `asset:` and `http://asset.localhost`). `AmlImage` node view resolves `attrs.src` → display URL asynchronously; the document keeps the relative path.
- **Paste/drop:** `editorProps.handlePaste/handleDrop` intercept image files, store them, insert image nodes at the caret or drop point.
- **Tables:** `TableMenu` (sticky toolbar, visible when the caret is in a table): rows/cols before/after, delete row/col, toggle header row, delete table. "Insert Table" command in the palette.
- **Footnotes:** "Insert Footnote" (⌘⌥F): next numeric id, reference at the caret, definition appended at the end with the caret placed inside it.
- **Properties panel:** right panel lists front-matter fields typed as text / number / boolean / list / date; edits rewrite the `frontMatter` node through a transaction carrying `ALLOW_FRONT_MATTER_REMOVAL`; add/remove fields; YAML mode for anything else. Comments in YAML are not preserved (documented limitation).
- **Palette commands run on the next tick** after the palette unmounts, so commands that focus the editor keep focus.

## Acceptance criteria
- [x] Asset naming/location rules and path guard (Rust tests).
- [x] Properties: edit, add, remove fields → saved YAML follows (e2e).
- [x] Insert table → type in cell → add row → canonical table markdown saved (e2e).
- [x] Insert footnote → `[^1]` at caret and `[^1]: …` definition with typed text saved (e2e).
- [ ] Paste a screenshot / drop a PNG in the real app: file appears under `assets/`, image renders, markdown holds the relative path. *(Manual, `qa/stage-1.md` §11 — the browser harness has no clipboard files.)*

## Lessons recorded (for future sessions)
- Do not focus the editor inside Tiptap `onCreate` or a layout effect — the view is not mounted yet and ProseMirror then ignores mouse selections. Focus in a plain `useEffect` keyed on the editor instance.
- Never pass the live document as `content` to `useEditor`; freeze the initial content per (path, docVersion).
- Playwright runs with one worker; under CPU contention Chromium drops synthetic keystrokes into contenteditable. Tests click into the target cell/paragraph before typing.
