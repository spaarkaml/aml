# WP-2.8 — Boundings and the Overview
**Stage:** 2 · **Depends on:** 2.1, 2.5, 2.7 · **ADRs:** 004, 010, 011 · **Sessions:** 1.5

## Goal
Boundings — virtual, many-to-many groups of notes that travel with the Folio — and the Overview home screen where they, Projects, the week and your recent notes are laid out.

## Design
- **Storage** (`src-tauri/src/boundings.rs`): `.aml/boundings.yaml`, inside the Folio because a Bounding is part of the work, not a per-device preference (ADR-004 keeps *derived* state out; this is authored state). The file is written **one note per line**, which is the CLAUDE.md rule for anything under `.aml/`: two devices that each add a note to the same Bounding edit different lines, so Syncthing's copies merge cleanly.
- **Why hand-written YAML:** the exact line shape *is* the feature, so the module writes and parses its own small, strict subset rather than serialising through a general YAML library — the same reasoning that keeps front matter hand-parsed. It reads unquoted values so the file can be hand-edited, ignores keys it does not know, and says so in the file header. No dependency added.
- **Identity:** each Bounding has a slug `id` that never changes, a `name`, a `colour` and an `icon`. The panel creates a Bounding only once it has a real name (the "+ New" row is a draft until saved), so ids always match the name the user chose rather than a placeholder.
- **Paths follow the note:** `entry_rename` remaps Bounding membership (a folder rename moves every note under it) and `entry_trash` drops the note out. Boundings hold paths, so without this a move would silently empty a group.
- **Search:** `bounding:Academic` now matches, by name and case-insensitively (WP-2.5 left the field returning false). `search_query` reads the Bounding file once per query and hands each `Doc` the names holding it — no index schema change, and the file is small.
- **Boundings panel:** the fifth left-panel view. Each row shows colour, icon, name and count; clicking lists its notes; `+`/`−` adds or removes the open note; `✎` opens an inline editor (name, icon, seven colours, delete-with-confirmation). Every Bounding is also a palette command, "Add to Bounding: Academic", re-registered when the list changes — the same Folio-driven command pattern WP-2.7 introduced for templates.
- **Overview** (`features/overview/Overview.tsx`) replaces the "pick one from the Browser" placeholder as the home screen: the Folio's name and note count, the current week (dotted where a Daily exists, click to open or start one), Bounding tiles, Project tiles, and recent notes. It reuses WP-2.7's date helpers and the tab store's recents rather than inventing its own.
- **Projects** are folders holding a `project.aml.yaml` (glossary §4). `projects_list` finds them so the Overview can cluster them; nothing creates one until WP-5.1, so the empty state says where they come from.
- **`LeftView` moved to the layout store.** Three features were reaching into the *tags* store to change which list the left panel shows; with a fifth view that was no longer defensible. It is layout state, and it now lives with the rest of it.
- **Dependencies:** none added.

## Acceptance criteria
- [x] The file round-trips with one note per line, keeps quotes and colons in names, reads a hand-written file, ignores unknown keys, never lists a note twice, and falls back to the id when a Bounding has no name (Rust tests `boundings.rs`).
- [x] Slugs are safe and unique; renaming or moving a note or its folder keeps it in its Boundings; Projects are found with their note counts (Rust tests `boundings.rs`).
- [x] `bounding:academic` matches by name and `-bounding:Academic` excludes (Rust test `index/search.rs`).
- [x] E2E: the Overview shows Boundings, the week bar opens a Daily, and recents follow; a Bounding can be created, named, coloured, filled from the open note, found by `bounding:` search, emptied and deleted; renaming a note keeps it in its Bounding (`e2e/boundings.spec.ts`).
- [ ] **Design review against the canvas** — the Overview's arrangement (tiles vs constellation, week bar placement) is yours to approve (`docs/qa/stage-2.md` §18).
- [ ] On your Folio: group your work into creative / academic / work / software and check the Overview reads at a glance (`docs/qa/stage-2.md` §19).

## Lessons recorded
- Adding a fifth left-panel view exposed two commands that assumed the Browser was showing: **Rename Note** and **Reveal Note in Browser** opened the panel but not the Folio view, so F2 did nothing visible. Anything that reveals a note must set the view as well as open the panel.
- Selecting a Bounding toggles, and a newly created one is already selected — worth knowing when writing tests against it.
- CI (not the local run) caught two keystroke faults this WP. One was the WP-2.6 focus lesson again, in `openNoteAt`: Tiptap's `focus()` left DOM focus on Quick Open's field, so typing after a heading jump went nowhere — `editor.view.focus()` is the fix, and that path is shared by every panel that opens a note. The other was `shell.spec` pressing a shortcut as its first action after a reload, before the global key listener existed; a test that presses keys must first wait for the shell.

## Not in this work package
- Automatic clusters from tags or links (Q10: Stage 7).
- Bounding-scoped Quick Open, and colouring notes in the Browser by Bounding — both wait until the Overview arrangement is approved.
