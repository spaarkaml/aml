# AML — Staged Development Plan

**Product in one line:** a self-hosted desktop writing environment (macOS + Windows) whose Folio lives on your home NAS, combining a linked-note knowledge base, a polished WYSIWYG markdown editor, and professional compile/typesetting — all on plain `.md` files.

**Revision 2026-09-09 (b):** Synced (bundled Syncthing) is now the default Folio location and ships in Stage 1; Network (SMB) + Offline Copy become optional Stage 4 work. Light + dark modes with an in-app colour editor (ADR-010). No code signing (ADR-012). Obsidian is being retired, so the importer is a one-time migration.

**How to read this plan.** Eight stages, each ending in a **Quality Gate** you sign off. Each stage is broken into **Work Packages (WP)** sized for one AI coding session. A stage cannot start until the previous gate is signed, except where a WP is marked *parallel-safe*. Estimates are AI sessions (≈ half-day each), not calendar time.

Open items referenced as **Q#** are in `00-OPEN-QUESTIONS.md`; decisions as **ADR-#** in `02-ARCHITECTURE-DECISIONS.md`.

---

## Stage map

| Stage | Theme | Sessions | Gate deliverable |
|---|---|---|---|
| 0 | Foundations | 6–8 | Empty app builds, signs, runs on both OSes; docs + CI + tokens in place |
| 1 | Write a note | 12–16 | A Synced Folio paired with the NAS; WYSIWYG editing, images, AU spelling, word count, fast navigation |
| 2 | Know your notes | 11–13 | Links, backlinks, tags, search, outline, templates, Daily, Boundings, Obsidian import |
| 3 | Write well | 9–11 | Focus/typewriter, themes, note Types, goals, Snapshots UI, syntax reveal |
| 4 | Trust the NAS | 5–7 | Conflicts panel, sync status, snapshot hardening, NAS checklist; optional Network (SMB) mode |
| 5 | Structure a book | 12–14 | Projects, Binder, Corkboard, Outliner, Stitch, Research pane |
| 6 | Compile & publish | 12–16 | PDF (print-ready), EPUB, DOCX, citations, footnotes/endnotes, presets |
| 7 | Extend | 6–9 | Diagrams, link graph, grammar, canvas notes |
| 8 | Harden & release | 6–8 | Signed installers, updater, perf/accessibility pass, v1.0 |

Roughly 80–95 AI sessions. Stages 2 and 3 can overlap; 6 and 7 can overlap.

---

## Stage 0 — Foundations

**Goal:** remove every "we'll decide later" that would otherwise be decided by accident inside AI-generated code.

| WP | Title | Output |
|---|---|---|
| 0.1 | Apply decisions: ADR-001…012 statuses, glossary frozen in `CLAUDE.md` | *Done 2026-09-09* |
| 0.2 | Repository scaffold: Tauri 2 + React + TS strict, pnpm, Biome, tauri-specta, Zustand, CSS Modules | "Hello Folio" window on mac + win |
| 0.3 | CI: GitHub Actions matrix (macos-latest, windows-latest); `pnpm check`; unsigned build artefacts; grep-fail on forbidden vocabulary | Green pipeline |
| 0.4 | Design tokens for Paper and Ink (ADR-010); mode switch (OS/manual); contrast report | `themes/paper.css`, `themes/ink.css`, report |
| 0.5 | App shell: window chrome, top bar with breadcrumb + tabs, left/right panel slots (slide-over and pinned states), Layout store (Desk/Page), command palette skeleton, shortcut registry, per-device settings store | Shell with empty panels, working palette, Layout toggle |
| 0.6 | Test infrastructure: Vitest, Playwright via tauri-driver, `test-corpus/` seeded with 60 files (every supported syntax, Raw pass-through cases, unicode/emoji/CJK/RTL, CRLF, BOM, no trailing newline), loopback SMB share script for CI where the runner allows | `pnpm test`, `pnpm e2e` in CI |
| 0.7 | Docs skeleton: `ARCHITECTURE.md`, `specs/` template, `qa/stage-0.md`, CHANGELOG, `BACKLOG.md` | — |

### Quality Gate 0 — status 2026-09-09
- [x] `pnpm check` and e2e green locally on macOS *(CI on both OSes needs the repo pushed to GitHub — your action)*
- [x] App opens on Mac; panels slide and pin; Layout toggles; palette opens *(Windows: pending your PC)*
- [x] Contrast report: every text token ≥ 4.5:1 on its surface (`docs/qa/contrast-report.md`)
- [ ] Ink (dark) palette approved by you on screen
- [x] Forbidden-vocabulary grep passes

---

## Stage 1 — Write a note (editor + Folio on the NAS)

**Goal:** create a Folio that is paired with the DRIVESTOR, browse it, write in a polished WYSIWYG editor that saves canonical markdown, paste images, get AU spelling and a word count, and move between notes without the mouse.

| WP | Title | Key acceptance |
|---|---|---|
| 1.1 | Folio basics: create/open a **Local** Folio; Rust FS commands (list tree, read, atomic write, rename, move, delete-to-trash); `notify` watcher; recent Folios | Tree of 5k files < 300 ms; atomic writes; OS trash |
| 1.1b | **Synced** Folio (ADR-005): Syncthing sidecar lifecycle (start/stop/health), generated config, pairing screen (NAS Device ID / QR), folder share + `.stignore`, sync status in status bar via REST; "Fallback to Network mode" note if pairing is impossible | Pair with the DRIVESTOR; a note edited on the PC appears on the Mac within 10 s; sidecar survives app restart |
| 1.2 | **Editor spike** (ADR-003): Tiptap document ↔ canonical markdown bridge for headings, paragraphs, emphasis, lists, links, code, blockquote, hr, front matter, **Raw** nodes | Round-trip corpus AST-equal and idempotent; Raw verbatim; 60 fps typing @ 50k words; go/no-go on library |
| 1.3 | Editor: images (`![]()` inline, paste/drop → `assets/`, Q12), tables (WYSIWYG with row/column menu), footnotes, task lists, properties panel for front matter | Corpus additions green |
| 1.4 | Editor: auto-pair, smart lists, indent/outdent, `/` block menu, markdown input rules (`# `, `**`, `- ` convert as you type), formatting toolbar-on-select, undo across reloads | — |
| 1.5 | Folio Browser panel: tree, folders, drag-move, create/rename/delete, context menu, badges; **tabs**, per-tab back/forward, breadcrumb, ⌘1–9 | E2E: every navigation shortcut in `05-UX-ALTERNATIVES.md` §Navigation |
| 1.6 | Quick Open (⌘O): fuzzy over titles/aliases/headings; empty query = recents; open in new tab | < 10 ms results |
| 1.7 | AU spell check (ADR-009): underline, suggestions, add-to-dictionary, ignore rules | 0 false positives on a 1,000-word AU list |
| 1.8 | Word count: status bar (note/selection), reading time, rules (Q19); Rust count for whole tree | Matches reference ± 0 |
| 1.9 | External-change handling: reload if clean, prompt if dirty, never clobber; detect `*.sync-conflict-*` files and list them (merge UI is Stage 4) | E2E: modify on disk while open |
| 1.10 | Continuous save (ADR-006): debounced 1 s + blur/close; unsaved dot; crash-safe temp files | Kill app mid-save 20× — no truncated files |

### Quality Gate 1 (manual script `qa/stage-1.md`)
- [ ] Pair a Synced Folio with the DRIVESTOR from both the Mac and the PC; edit on each in turn; the other shows the change within 10 s
- [ ] Pull the network cable while typing: nothing changes for you; reconnect and the NAS catches up; status bar reflects both states
- [ ] Paste 5 images, drag 3 files, create/rename/move notes from the Browser
- [ ] 10 minutes of typing in a 40k-word note: no lag, no lost characters
- [ ] Save a note, open in a plain text editor: markdown is clean and readable; re-save in AML changes nothing (idempotent)
- [ ] A note containing HTML and an Obsidian callout survives open → save byte-for-byte in those regions (Raw)
- [ ] Spell check flags "color", accepts "colour"; personal dictionary follows the Folio
- [ ] Navigate 20 notes using only the keyboard
- [ ] Editor library locked (ADR-003 note updated with the chosen library and bridge)

---

## Stage 2 — Know your notes (knowledge layer + Obsidian import)

| WP | Title | Key acceptance |
|---|---|---|
| 2.1 | Index (ADR-007): SQLite FTS5 in local app-data; incremental via watcher; rebuild command with progress | 5k notes < 5 s; UI never blocks |
| 2.2 | Links: `[[Note]]`, `[[Note#Heading]]`, `[[Note\|alias]]`, `[text](rel.md)`; autocomplete popup; click/⌘-click; create-on-click; **rename propagates** with preview | Rename updates 100 % of links in corpus |
| 2.3 | Backlinks panel + unlinked mentions | — |
| 2.4 | Tags: inline `#tag/nested`, front matter `tags:`; Tags panel with hierarchy and counts | — |
| 2.5 | Search panel: query language (`path: tag: file: type: status: bounding: "phrase" /regex/ -not OR ( )`), snippets, replace-in-note | 40+ parser unit cases |
| 2.6 | Outline panel: heading tree, jump, drag-reorder sections, current-section highlight | — |
| 2.7 | Templates + Daily: `_templates/`, placeholders, "Today" command, calendar strip | — |
| 2.8 | **Boundings** (ADR-011): create, add/remove notes, colour + icon, Boundings panel; **Overview** home with Boundings and Projects as clusters, recents, week bar | Design review vs canvas |
| 2.9 | Command Palette complete; every command discoverable and rebindable | E2E presses each shortcut |
| 2.10 | **Obsidian migration** (Q5, one-time — Obsidian is being retired): choose the vault folder → copy into the Folio; map `[[wikilinks]]`, `![[embeds]]`, `#tags`, callouts (→ Raw until 3.9), attachments → `assets/`, daily notes → `journal/`, templates → `_templates/`; canonical normalisation; report listing anything held as Raw so you can tidy it by hand | Your notes import with 0 broken links; report reviewed |

### Quality Gate 2
- [ ] Import your Obsidian vault; spot-check 20 notes; every link resolves
- [ ] Rename a heavily linked note; every reference updates; undo restores all
- [ ] Search `tag:#research bounding:Academic -status:done "information operations"` returns the expected set
- [ ] Create today's Daily from template in one keystroke
- [ ] Group your work into Boundings (creative / academic / work / software); Overview reads at a glance
- [ ] Delete the local index → rebuild within budget

---

## Stage 3 — Write well

| WP | Title |
|---|---|
| 3.0 | **Visual refresh (ADR-013)**: the Apple-light foundation — system face, type ramp, spacing rhythm, radii, elevation, a drawn icon set, motion — across the whole shell. Added after 3.1 and 3.2, at Bryce's call, from a design canvas of three directions |
| 3.1 | Focus Mode (paragraph/sentence dimming), Typewriter Mode, Zen (hide all panels) — per-device |
| 3.2 | Appearance settings (ADR-010): light/dark/OS switch, per-token colour editor with live preview and reset, font picker (bundled + system), measure/leading/spacing; saved to `.aml/config.yaml` with per-device override |
| 3.3 | Note Types (Q9): registry from `_templates/`, colour + icon, "New <Type>" commands, type-specific properties |
| 3.4 | Goals (Q18): per-note, per-Project + deadline, daily; Sessions; progress ring; Goals panel |
| 3.5 | ~~Snapshots UI (ADR-006): "Snapshot…" with label, timeline per note, diff, restore (snapshot-before-restore)~~ **done 2026-09-14 with WP-4.1** — History opens from *Saved* in the status bar, the editor's right-click menu or the palette; `docs/qa/stage-4.md` §15–§17 carry Gate 3's snapshot line |
| 3.6 | Paste intelligence: Word/Google Docs/web → clean markdown; paste-as-plain |
| 3.7 | Statistics panel: words, characters, sentences, readability, per-heading counts |
| 3.8 | **Syntax reveal** (Typora-style): show raw markers for the mark/block under the caret; toggleable |
| 3.9 | Callouts/admonitions modelled as proper nodes (Obsidian `> [!note]` syntax) — retires those Raw nodes from import |

### Quality Gate 3
- [ ] A ≥ 1,500-word session in Focus + Typewriter; zero blockers logged
- [ ] Paste a Word chapter with footnotes and a table: clean markdown you'd accept
- [ ] Change three colours in dark mode, restart on the other machine: they followed via the Folio
- [ ] Daily goal progress and deadline maths correct
- [ ] Snapshot → edit → compare → restore: restored file byte-identical to snapshot
- [ ] Re-run Obsidian import report: callout Raw count is 0

---

## Stage 4 — Trust the NAS (conflicts, status, hardening; optional Network mode)

| WP | Title |
|---|---|
| 4.1 | ~~Snapshot engine hardening: 30-minute scheduler, before-destructive-ops, retention job, size reporting~~ **done 2026-09-14, engine and WP-3.5's UI together** (there was no engine to harden). Not a timer: before a note is written, the text on disk is kept if this sitting has not in 30 minutes; labelled ones before a restore and a conflict resolution; retention on Folio open (7 days / daily to 90 / labels / always the newest); size in Settings; `docs/qa/stage-4.md` §15–§20. The Conflicts merge is still two-way — a base Snapshot is the next step for it |
| 4.2 | ~~**Conflicts panel**: `*.sync-conflict-*` files and external-change-while-dirty cases; side-by-side merge (base = latest Snapshot), keep/merge/discard; also merges `project.aml.yaml` and `boundings.yaml` line-wise~~ **done 2026-09-14**, before 4.1 by decision, so the comparison is **two-way** until Snapshots exist. Copies leave the Browser and the index; everything given up goes to the Trash; `docs/qa/stage-4.md` §1–§9 |
| 4.3 | ~~Sync status and health: per-Folio state (up to date / syncing / NAS unreachable / paused), last-seen NAS time, out-of-sync banner after N minutes, one-click "open Syncthing UI" for the rare deep dive~~ **done 2026-09-14**. The banner is for a sync that is **stuck while connected** (failed files, or ten minutes without movement), never for being offline — offline says how long in the status bar instead; `docs/qa/stage-4.md` §10–§14 |
| 4.4 | NAS checklist in Settings: Syncthing versioning enabled on the NAS folder, backup job configured (from `06-NAS-SETUP.md`), free space, last backup — read via Syncthing REST where possible, else manual tick boxes |
| 4.5 | Cross-OS safety: Windows file locks and long paths; macOS/Windows case-collision warning; Unicode normalisation (NFC/NFD) of filenames between macOS and the NAS |
| 4.6 | *(optional)* **Network** location (SMB direct): polling watcher, remount prompt, unsaved buffer when the share drops; **Offline Copy / Return** with three-way merge. Only built if Synced proves unusable on the DRIVESTOR or you ask for it |

### Quality Gate 4
- [ ] Edit the same note on both machines while one is offline; reconnect: conflict file appears in Conflicts within 10 s; merge is correct; nothing lost
- [ ] Kill during save 20×: no truncated files, no half-synced files on the NAS
- [ ] Status bar reflects NAS unreachable within 60 s of unplugging the NAS; recovers on plug-in
- [ ] Restore a Snapshot from a week ago on machine A; machine B receives the restored note
- [ ] NAS checklist shows versioning and backup as configured

---

## Stage 5 — Structure a book

| WP | Title |
|---|---|
| 5.1 | Project manifest (ADR-004): create Project, Binder order/tree, include-in-compile, per-item metadata synced with front matter — *done 2026-09-12* |
| 5.2 | Binder panel (replaces Browser inside a Project): drag reorder/nest, parts/chapters, split-at-cursor; **Project tabs** appear in the top bar — *done 2026-09-12* |
| 5.3 | Corkboard: card grid, synopsis in place, colour by label/status, reorder — *done 2026-09-12* |
| 5.4 | Outliner: configurable columns, inline edit, sort/filter, totals |
| 5.5 | Stitch: multiple notes as one continuous editor; writes back per file; separators |
| 5.6 | Research panel: `research/` browser; PDF viewer with page-referenced quote copy (Q20); images; web clip |
| 5.7 | Split view and Layouts: pin any panel, save/switch named Layouts, per device |
| 5.8 | Project dashboard — *done 2026-09-12* |

### Quality Gate 5
- [ ] Recreate a real manuscript as a Project; reorder in Corkboard → Binder/file order agree; Outliner totals match
- [ ] Stitch 12 scenes, edit across boundaries, save → each file correct, Snapshots recorded
- [ ] Read a PDF in Research pinned beside the draft; copy a quote with page number
- [ ] Manifest survives a deliberate both-sides edit (Syncthing conflict) via the Conflicts panel line-wise merge

---

## Stage 6 — Compile & publish

| WP | Title |
|---|---|
| 6.1 | Sidecars (ADR-008): bundle Pandoc + Typst per target; pinning; temp dirs; progress/cancel; errors mapped to the note and line |
| 6.2 | Compile model: Presets in manifest (selection, front/back matter, heading→chapter mapping, separators, footnote placement (Q7), title page, formats) |
| 6.3 | Canonical markdown → Pandoc → DOCX (styles template), EPUB 3 (cover, metadata, TOC, CSS), HTML; wikilinks → cross-refs or text |
| 6.4 | Book Designs (Typst): Classic Fiction, Modern Fiction, Academic Thesis (ANU margins), Report; trim presets (Q8); running heads, drop caps, scene breaks, widows/orphans, embedded fonts (Q14) |
| 6.5 | Citations (Q6): `.bib` in Folio, `[@key]` autocomplete, CSL (APA 7, Chicago, Harvard), bibliography; Zotero export how-to |
| 6.6 | Footnotes/endnotes: per-preset placement; numbering rules |
| 6.7 | Live PDF preview panel (Typst incremental) |
| 6.8 | Print compliance: bleed/trim/margins; PDF/A-2b; PDF/X-1a stretch; pre-flight report |
| 6.9 | Single-note export: PDF/DOCX/HTML with current theme |

### Quality Gate 6
- [ ] 6×9 PDF passes KDP and IngramSpark pre-flight
- [ ] EPUB passes `epubcheck` 0 errors; opens in Apple Books and Kindle Previewer
- [ ] DOCX opens in Word with styles, footnotes, bibliography intact
- [ ] Thesis preset: APA 7 correct against 10 known references
- [ ] Two presets from one Project (fiction/academic) without editing notes

---

## Stage 7 — Extend

| WP | Title |
|---|---|
| 7.1 | ~~Diagrams: a structured editor for formulation, genogram, sociogram and influence maps, written as a re-editable SVG in the note's `assets/`~~ **done 2026-09-13**. **WP-7.2 folded in by decision** (one charting feature, not two) and **Mermaid dropped**: it decides the layout, and in these diagrams position *is* the meaning. Mermaid fences still round-trip untouched; `docs/qa/stage-7.md` §10–§18 |
| 7.2 | ~~Canvas notes (Excalidraw-style) — if Q15 wants freehand~~ **folded into 7.1, 2026-09-13**: freehand was not wanted, a structured editor was |
| 7.3 | ~~Link graph: local and Folio-wide, clustered by Bounding~~ **done 2026-09-12** (pulled forward). ⌘⇧G for the Folio, a Context-panel section for the open note; `docs/qa/stage-7.md` |
| 7.4 | Grammar via LanguageTool on the NAS (Docker), AU English — if Q21 = yes |
| 7.5 | Template scripting — only if wanted |

Removed from v1 by your answers: real-time or review collaboration (Q2 = single author), Scrivener importer (Q5 = none to import). Both are in `BACKLOG.md`.

### Quality Gate 7
Per-WP acceptance; gate is "nothing in 7 regressed Stages 1–6" (full e2e + round-trip corpus).

---

## Stage 8 — Harden & release v1.0

| WP | Title |
|---|---|
| 8.1 | ~~Unsigned release builds (ADR-012): `release.yml` producing `.dmg` and `.msi`; first-run instructions for Gatekeeper and SmartScreen on the release page; the updater endpoint and the release checklist~~ **done 2026-09-12** (pulled forward: the MSI cannot be built on the Mac, and the alternative was mailing installers). Releases are published rather than drafted, add the NSIS `-setup.exe` and `latest.json`, and `docs/RELEASING.md` is the checklist |
| 8.2 | ~~Auto-update from GitHub Releases (Tauri updater with its own minisign key — no OS certificate needed)~~ **done 2026-09-12** (pulled forward). Silent checks, an invitation in the status bar, one button; `docs/qa/stage-8.md` §1–§9. Gate 8's "update from previous build" line needs a second release to exist |
| 8.3 | Performance pass: 10k-note Folio |
| 8.4 | Accessibility pass: keyboard-only, screen-reader labels, reduced motion, contrast |
| 8.5 | Local crash log + "Report problem" zip (no telemetry) |
| 8.6 | Onboarding: first-run Folio picker (Synced/Local), pairing walkthrough, NAS checklist, sample Folio tour |
| 8.7 | Docs freeze; user guide; v1.1 backlog |

### Quality Gate 8
- [ ] Fresh install on clean Mac and Windows from the release page following the unsigned-app instructions
- [ ] Update from previous build succeeds
- [ ] Two weeks of daily use across two devices with zero data-loss incidents
- [ ] All budgets met; all stage QA scripts re-run green

---

## Cross-cutting quality controls

1. **Round-trip corpus grows every stage** — every new syntax adds files and expected canonical output.
2. **Stage QA scripts** written at stage start from the specs, reviewed by you, executed by you at the gate; results logged with date, OS, build hash, Folio location type.
3. **Regression rule:** any gate bug becomes a test before it is fixed.
4. **Data-loss incidents are P0** — stop feature work until root-caused, tested, fixed.
5. **Design review at Gates 2, 3, 5, 6** against `05-UX-ALTERNATIVES.md` and tokens; screenshots archived.
6. **Dependency review** at each gate; bump deliberately, never mid-WP.
7. **Every gate from 1 onward is run with a Folio actually paired to the DRIVESTOR**, not only a Local Folio.

## Risks & mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| WYSIWYG serialiser silently loses or reshapes content | Data loss / diff noise | Raw nodes; AST-equal + idempotence corpus; Obsidian import normalises once; Stage 1 gate checks a plain-text view |
| Syncthing not available for this DRIVESTOR model | No Synced mode | Check on install day (`06-NAS-SETUP.md`); WP 4.6 Network mode is the fallback |
| Sidecar lifecycle bugs (orphaned Syncthing process, port clash) | Sync silently stops | Health check on launch; status bar; e2e kills and restarts the sidecar |
| NAS volume without snapshots | Thin backstop | Syncthing Staggered Versioning on the NAS is the backstop regardless of file system; AML Snapshots primary; backup job |
| Same note edited on two devices while apart | Conflict | Syncthing conflict file → Conflicts panel merge; nothing overwritten |
| Print-PDF compliance (PDF/X) | Ingram rejection | PDF/A first; standard PDF with embedded fonts is accepted by both; PDF/X stretch |
| Scope creep | Never ships | Gates are the only place features are added; `BACKLOG.md` |
| AI regressions across sessions | Quality decay | Playbook; CI blocks merge; specs are the prompts |
| Sidecar size/licensing | Installer bloat | Pandoc ≈ 40 MB, Typst ≈ 20 MB, Syncthing ≈ 25 MB; budget raised to 90 MB per OS |
