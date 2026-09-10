# WP-2.2 — Links
**Stage:** 2 · **Depends on:** 2.1, 1.4, 1.6 · **ADRs:** 001, 007 · **Sessions:** 1

## Goal
Notes link to each other the way they do on disk — `[[Note]]`, `[[Note#Heading]]`, `[[Note|alias]]`, `[text](rel.md)` — with a picker while typing, click to follow (or create), a visible mark on links that point nowhere, and renames that carry every link with them after a preview.

## Design
- **One resolution rule, in Rust** (`index/links.rs`, `Index::resolve(from, target, kind)`): `md` links are joined to the linking note's folder and matched case-insensitively against `notes.path`; wiki targets with a `/` match a path suffix; bare wiki targets match `notes.stem` (same folder first, then shortest path), then front-matter `title`, then an alias. `link_resolve(from, links[])` batches this for the editor.
- **Editor plugin `NoteLinks`** (`editor/extensions/links.ts`): collects every wiki link, embed and `.md` link mark in the document, resolves them in one call 250 ms after the last change (memoised per Folio in `features/links/store.ts`, invalidated on `folio-changed`), and paints `.aml-link-missing` (dashed) on those that resolve to nothing. Click on a wiki link or a `.md` link opens the note (`openNoteAt`, heading honoured); a missing wiki link creates `<target>.md` beside the current note (or at the folder given in the target) and opens it. External URLs are untouched (no opener plugin yet).
- **Picker** (`editor/extensions/linkmenu.ts` + `features/links/LinkMenu.tsx` + `complete.ts`): typing `[[` opens a list built from Quick Open's index entries — titles, stems and aliases fuzzy-ranked; `[[Note#` lists that note's headings; an unmatched query offers *Link to new note*. Enter/Tab/click replaces `[[query` (and the auto-paired `]]`) with a `wikiLink` atom whose target is the file stem, or the path when another note shares the stem; alias matches write `[[Note|alias]]`. Arrow keys and Enter are only captured while the list has rows.
- **Rename propagation** (`Index::rename_preview(from, to)` → `RenamePreview { notes: [{ path, newPath, edits: [{ line, before, after }] }], links }`, then `apply_edits` after the file move): candidates are notes whose `links.key` equals a moved note's stem plus the moved notes themselves; each link is resolved and rewritten only if it resolves to a moved note. Bare wiki targets become the new stem (or the full path if the new stem is ambiguous); path targets and `.md` links become the new path (relative and percent-encoded for `.md`); headings and aliases are kept; code fences and spans are never touched. A note moved to another folder gets its own relative `.md` links fixed. Apply checks each line still equals `before` (skips otherwise), preserves CRLF, writes atomically; the watcher then re-indexes.
- **UI flow** (`useFolioStore.rename(from, to, links = "ask")`): preview → if it touches links, `RenameLinksDialog` (per-note before/after lines; *Rename and update links* / *Rename only* / *Cancel*) → `entry_rename` → apply → invalidate link cache. A dirty open note is saved before the rewrite so the watcher reload cannot lose text. **Undo Last Rename** (palette) renames back with `links: "update"`, no dialog.
- **Dependencies:** none added.

## Acceptance criteria
- [x] Resolution: same-folder preference, path suffix, title and alias fallbacks, `..` in `.md` links, escape from root refused (Rust tests).
- [x] Rename rewrites wiki (bare, `#heading|alias`, `.md`-suffixed), path-form and `.md` links across notes; leaves code spans; ambiguous stems use the full path; folder renames move children and update links into the folder; a moved note's own relative links are fixed; apply skips changed lines and keeps CRLF (Rust tests in `index/links.rs`).
- [x] **Rename updates 100 % of links in the corpus:** the Rust test re-indexes after apply and resolves every link to the new note.
- [x] Picker ranking: title > stem > alias, alias written as `|alias`, `#` lists headings, ambiguous stem → path, create row only when no exact title (unit tests `links/complete.test.ts`).
- [x] E2E: `[[meth` → Enter inserts `[[04 Methods]]`, saved markdown holds it, click opens the note; `[[Brand New` → dashed link → click creates and opens the note; renaming a linked note shows the dialog with the rewritten line, updates the other note, and Undo Last Rename restores name and link (`e2e/links.spec.ts`).
- [ ] Gate 2 "rename a heavily linked note; every reference updates; undo restores all" on your real Folio (`docs/qa/stage-2.md` §6–8).

## Lessons recorded
- The mock `folio_tree` returned the same array reference after an in-place rename inside a nested folder, so React saw no change; it now returns a `structuredClone`, as Rust returns fresh data. Mocks must mirror the reference semantics of the real commands.
- Enter must fall through to ProseMirror when the picker has no rows, otherwise `[[` blocks new paragraphs; the plugin reads the row count from the store.
