# WP-2.6 — Outline
**Stage:** 2 · **Depends on:** 1.2, 1.5 · **ADRs:** 001, 003 · **Sessions:** 0.5

## Goal
The open note's heading structure, in the Context panel: jump to a heading, see which section the caret is in, and drag a whole section to a new place in the note.

## Design
- **Source of truth is the live document**, not the index (`features/outline/outline.ts` reads the ProseMirror doc). The outline must follow unsaved edits, and the index only knows what is on disk. `outline.ts` takes a structural `DocLike`, so its tests are plain objects rather than a booted editor.
- **Sections:** headings are always top-level in the AML schema, so a section is a heading plus every top-level node after it up to the next heading of the same or a higher level. `depth` collapses skipped levels, so an H1 → H3 jump indents once rather than twice.
- **Feeding the panel** (`editor/extensions/outline.ts`): a ProseMirror plugin view pushes headings and the caret into `useOutlineStore` on every document or selection change. The store compares the new heading list with the old and only sets state when a heading actually changed, so typing inside a paragraph costs one comparison and no React render. Positions are deliberately *not* stored — they shift on every keystroke; `jump` and `move` re-read them from the live editor at the moment they act.
- **Reordering:** dragging a row onto another moves the whole section (subheadings and all) to just before that heading; a drop zone appears at the end of the list while dragging. `planMove` refuses a section into itself and a move that changes nothing. The edit is one transaction (`delete` + `insert` of the sliced content), so it saves like any edit and ⌘Z undoes it in one step; the caret rides with the moved section so the move can be repeated.
- **Keyboard:** **Move Section Up / Down** (`mod+shift+↑/↓`, palette) move the caret's section among its peers via the same `planMove`, so drag is not the only way. Palette **Show Outline** opens the Context panel.
- **Dependencies:** none added.

## Acceptance criteria
- [x] Nesting, collapsed level jumps, section ends, active section from the caret, `planMove` (including into-itself and no-op refusals, and carrying subsections), `stepTarget` (unit tests `features/outline/outline.test.ts`).
- [x] E2E: the outline lists both headings with their levels; the highlight follows a jump; editing a heading updates the row immediately; dragging the second section above the first moves its content with it; **Move Section Down** puts it back (`e2e/outline.spec.ts`).
- [ ] On your Folio: a long chapter's outline reads correctly and reordering a section leaves the markdown clean (`docs/qa/stage-2.md` §15).

## Lessons recorded
- Switching notes mounts the new editor view *before* destroying the old one, so the outgoing view's `destroy` wiped an outline the incoming view had just filled. The store now records which view owns the outline and ignores a release from any other — the same shape any editor-fed store will need.
- Tiptap's `focus()` command did not reliably move DOM focus out of a panel button; `editor.view.focus()` does. Anything that acts on the note from a panel must return focus explicitly or the next keystroke goes nowhere.
