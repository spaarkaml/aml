# WP-1.4 — Editor ergonomics
**Stage:** 1 · **Depends on:** 1.2 · **ADRs:** 003 · **Sessions:** 1

## Goal
Make typing in the WYSIWYG editor feel like Typora: brackets and quotes pair themselves, `/` opens a block menu, selected text gets a formatting toolbar, and `[[Note]]` turns into a link as you type.

## Design
- **Auto-pair (`extensions/autopair.ts`):** `( [ { "` insert their pair with the caret between; typing the closer skips over an existing one; Backspace inside an empty pair removes both. With a selection, `( [ { "` wrap it and `* _ \`` toggle italic / italic / code instead of inserting literal markers (a literal `*` would not be emphasis in WYSIWYG). `"` pairs only after whitespace or an opener so apostrophes and inch marks are untouched. Nothing happens inside code blocks or inline code. `*`, `_` and `` ` `` without a selection are left to the markdown input rules.
- **Wiki links while typing:** the moment the second `]` of `[[…]]` lands (typed or skipped over), the text is replaced by a `wikiLink` atom parsed with the same `parseWikiLink` as the markdown bridge. Done in the auto-pair handler rather than a Tiptap input rule: `nodeInputRule` keeps the text around a capture group and fires before the skip-over.
- **`/` block menu (`extensions/slash.ts` + `SlashMenu.tsx`):** a ProseMirror plugin tracks a `/` typed at the start of a paragraph or after a space (opens on typing only, never on caret movement) and mirrors `{ from, query, coords }` into `slashStore`. The React menu filters items with `lib/fuzzy`, anchors under the caret, and on Enter/click deletes `/query` and runs the item: Heading 1–3, bullet / numbered / task list, quote, code block, table, divider, footnote, link to note (`[[|]]`), today's date. ↑/↓ move, Escape dismisses and keeps the `/`.
- **Selection toolbar (`SelectionToolbar.tsx`):** floats above a non-empty text selection (not in code blocks): Bold, Italic, Strikethrough, Code, Link (inline URL field; Enter applies, Escape cancels; removes the link when already linked), H1–H3. Buttons act on `mousedown` with `preventDefault` so the selection survives; the toolbar stays while the URL field has focus.
- **Lists:** Enter / Tab / Shift-Tab / Backspace behaviour comes from StarterKit's `ListKeymap`; nothing added.
- **Not done:** undo history across an external reload. The editor is recreated when the note changes on disk, so history resets; conflicts are rare and the on-disk copy is authoritative (ADR-003). Revisit if it bites.
- **Dependencies:** none added.

## Acceptance criteria
- [x] `(` → `()`, `a)` skips, `{`+Backspace clears the pair, `[[04 Meth]]` becomes a link and saves as `[[04 Meth]]` (e2e).
- [x] `/` opens the menu, `quo` + Enter makes a blockquote saved as `> …`, Escape keeps the `/` (e2e).
- [x] Double-click a word → toolbar; Bold and Link apply and save as `[**Quick**](https://example.org)` (e2e).
- [x] Existing markdown input rules (`## `, `**bold**`, `- `) still fire (e2e, editor.spec).
- [ ] Real app: pairing with the macOS/Windows keyboard layouts (`"` on non-US layouts), `/` menu position near the bottom of the window. *(Manual, `qa/stage-1.md`.)*

## Lessons recorded
- ProseMirror adopts a mouse-placed caret asynchronously. E2E steps that click then type must wait for the editor's own selection to catch up (`e2e/helpers.ts` `clickEndOf`), and must wait for the mount-time focus (`waitForEditor`) before the first interaction.
- Do not run Playwright against the Browser-pane dev server: its hot-reloaded module state produced failures that a fresh `pnpm dev` did not. Free port 1420 first.
