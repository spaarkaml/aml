# WP-2.4 — Tags
**Stage:** 2 · **Depends on:** 2.1 · **ADRs:** 001, 007 · **Sessions:** 0.5

## Goal
Tags written inline (`#tag`, `#parent/child`) or in front matter (`tags: [a, b]`) are collected across the Folio and shown as a hierarchy with counts; a tag lists its notes; a tag chip in a note jumps to it.

## Design
- **Data:** the index already stores every tag occurrence (`tags(note, tag, line)`, lower-cased, purely numeric tags ignored — WP-2.1). `tags_list` returns the distinct (tag, note, title) pairs; the UI derives the hierarchy and the counts from that (`features/tags/tree.ts`: `buildTagTree` nests on `/`, `notes` counts distinct notes in the subtree, `direct` those on the tag itself; `notesForTag` lists a tag's notes including nested tags). `tag_notes(tag)` exists for future search/Bounding use.
- **Left panel** (`app/shell/LeftPanel.tsx`): a segmented control switches between **Folio** (the Browser) and **Tags** (`TagsPanel`). Choice and expanded tags persist per device (`aml.tags`). Selecting a tag lists its notes beneath the tree; clicking opens the note in a tab.
- **Editor:** clicking a `#tag` chip (`editor/extensions/tags.ts`) calls `useTagsStore.show(tag)`: opens the left panel on Tags with the tag's ancestors expanded and the tag selected. Palette: **Show Tags**.
- **Refresh:** on Folio open (with Quick Open's index load) and on every `folio-changed`.
- **Dependencies:** none added.

## Acceptance criteria
- [x] Pairs are distinct per (tag, note); front-matter and inline tags merge case-insensitively; `tag_notes` includes nested tags and not prefixes of other words (Rust test `index/tags.rs`).
- [x] Tree nesting and distinct subtree counts; notes for a tag include nested tags once each; ancestors (unit tests `tags/tree.test.ts`).
- [x] E2E: Tags view shows `#thesis 2` / `#journal 1`, expanding reveals `#ch3 1`, selecting lists both notes and opens one; the view choice survives a reload; clicking `#thesis/ch3` in a note opens the Tags view on it (`e2e/tags.spec.ts`).
- [ ] On your Folio: the tree matches how you actually tag; counts look right (`docs/qa/stage-2.md` §12).

## Lessons recorded
- Giving the view switch `role="tab"` made every existing `getByRole("tab", { selected: true })` ambiguous with the note tabs; segmented controls here are plain `aria-pressed` buttons.
