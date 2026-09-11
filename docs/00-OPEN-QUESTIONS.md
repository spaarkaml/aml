# AML — Open Questions & Ambiguities

These are the points in the brief where different readings lead to materially different builds. Each has a **working assumption** that the plan uses until you say otherwise. Answer inline (edit this file) or reply in chat; the plan and ADRs will be updated to match.

Priority key: **A** = blocks Stage 0/1 decisions · **B** = needed before the stage that uses it · **C** = can be decided late.

**Status 2026-09-09 (b):** Q1–Q5, Q13, Q14, Q24, Q25, Q26 answered and applied. **No Stage 0 blockers remain.** Q3 was revisited: the NAS is a blank slate, so Synced (bundled Syncthing) is now the default and Network (SMB) is optional.

---

## A. Blocking for foundations

### Q1. What does "functional version control" mean to you?  (A)
Options, from lightest to heaviest:
1. **Per-document snapshots** (Scrivener style): manual + automatic point-in-time copies of a single note, with diff and restore.
2. **Workspace history**: every save recorded, browse the whole library at any past moment, restore any file.
3. **Full git**: branches, commits with messages, merges, remote push to the NAS.

**Why it matters:** Git repositories and Syncthing are a known bad combination when `.git` is synced between devices editing concurrently (index corruption). Options 1–2 can be built as immutable, content-addressed files that Syncthing handles perfectly.
**Working assumption:** Option 2 (workspace history) built app-natively, with Option 1 as its UI, plus Syncthing's own file versioning on the NAS as a backstop. Git is *not* used for user content.

Answer: Autosaving every 30minutes and rely on Syncthing's file versioning should be fine.

**Applied (ADR-006):** the note on disk is saved continuously (≈1 s after typing pauses) — the 30 minutes is the *Snapshot* cadence, since losing half an hour of writing is never acceptable. Snapshots are full copies under `.aml/snapshots/`. One catch: with Q3's direct-NAS answer, Syncthing is not in the write path, so "Syncthing's file versioning" only exists in Synced mode. In Network mode the backstop is the NAS's own snapshots (see Q24). Tell me if you meant something different by "autosaving every 30 minutes".

### Q2. What does "collaboration" mean?  (A)
Your message mentions "professional-grade export/typesetting/collaboration"; the brief itself does not mention collaboration. Options:
1. **None at v1** — single author, multi-device.
2. **Asynchronous review**: comments/annotations and change-tracking stored in the markdown or a sidecar, shared via export (DOCX with tracked changes for an editor to mark up, then re-import).
3. **Real-time co-editing** (Google Docs style): requires a CRDT (e.g. Yjs) and a relay service running on the NAS in Docker, plus accounts/identity.

**Why it matters:** Option 3 roughly doubles the architecture (server, auth, presence, CRDT-backed editor) and changes the editor choice.
**Working assumption:** Option 2, scheduled in Stage 7. Option 3 is explicitly out of scope unless you confirm it.

Answer: Option 1. Single author, multi device is to be expected.

**Applied:** review/collaboration WPs removed from Stage 7 and parked in `BACKLOG.md`. No CRDT, no server, no accounts.

### Q3. Where does the app read files from?  (A)
**Working assumption:** The app reads/writes a *local* folder on each Mac/PC that Syncthing keeps in sync with the NAS. The app never talks to the NAS directly (no SMB mounts). This is the only arrangement that gives offline use and avoids file-lock problems. Confirm this matches your setup. Also confirm: is Syncthing already installed on the DRIVESTOR (App Central → Syncthing) and on your machines?

Answer: I want the app to read/write directly from the NAS ideally. The laptop/pc must be connected to the home network to work. Incorpotate an option to create a local copy on my laptop incase I travel so that on return I can resync with the NAS to update it. (I don't know if this means I need SMB, but if so then yes.) Also, Synchthing is not yet installed - though I will be installing it on my NAS. Do I need to install it on my MacOS/Windows or can it just be included in the AML 2.0 App?

**Applied (ADR-005):** a Folio has a *location type*. **Network** (your default) = an SMB share on the DRIVESTOR mounted by the OS; AML opens it directly, polls for changes (file events don't work over SMB), keeps its index locally, and buffers unsaved text if the share drops. **Offline Copy** = "Take Offline" copies the Folio locally with a checkout manifest; "Return" does a three-way merge back to the NAS and surfaces conflicts. **Synced** = optional mode where Syncthing is *bundled inside AML* — yes, it can be included; nothing separate to install on Mac/Windows, only the NAS-side Syncthing app.
**Revisited (b):** you asked for a lead since the NAS isn't set up yet. **Decision: Synced is the default and ships in Stage 1**; travel needs no special mode; Network/Offline Copy moved to optional Stage 4. Setup steps for install day are in `06-NAS-SETUP.md`. This also resolves the Q1 contradiction: Syncthing versioning is back in the write path.
**SMB setup on the DRIVESTOR:** enable SMB in ADM → Services, create a shared folder for the Folio, give your user read/write. On macOS: Finder → Go → Connect to Server → `smb://<nas-name>/<share>`. On Windows: map a network drive to `\\<nas-name>\<share>`. AML remembers the share URL and prompts to reconnect.

### Q4. Editor philosophy: source-faithful or WYSIWYG-first?  (A)
Two ways to achieve "Typora-like live preview":
- **A. Markdown-faithful live preview** (Obsidian's approach): the text you edit *is* the file; rendering is an overlay. Syntax fades on the active line exactly as described. Files are never rewritten by the app, so Syncthing diffs and history stay clean. Tables and complex blocks are rendered as widgets and are slightly less "Word-like" to edit.
- **B. WYSIWYG document model** (Typora's approach): a rich document that is serialised back to markdown on save. Tables, images and lists feel most natural. Anything the parser doesn't understand may be normalised or lost on save.

**Working assumption:** Approach A, with a Stage 1 spike that must pass a fidelity test before we commit. See ADR-003 for the trade-off in full.

Answer: I really want it to be WYSIWYG in the sense that high polish is prioritised, with .md being an easily customisable format to interperete by the software.

**Applied (ADR-003):** editor is a ProseMirror document (Tiptap) parsed from and serialised to a *canonical AML markdown* dialect. Consequences you should know: (1) AML rewrites each note in its canonical style the first time it saves it, so files edited by other tools will be reformatted once; (2) anything the parser doesn't understand is kept verbatim as a "Raw" block rather than dropped; (3) the fidelity test becomes "same meaning, and re-saving changes nothing" instead of "byte-identical". The Typora-style syntax reveal becomes a Stage 3 enhancement.

### Q5. Do you have an existing corpus to import?  (A)
An existing Obsidian vault, Scrivener projects, Reedsy manuscripts, Word documents? Approximate size (files, GB, largest doc)? This decides (a) whether `[[wikilinks]]` must be Obsidian-compatible and (b) whether a Scrivener `.scriv` importer is a Stage 5 requirement.
**Working assumption:** Obsidian-compatible `[[wikilinks]]` and `#tags` are supported from day one; no Scrivener importer in v1.

Answer: I have an obsidian vault I'd like to import across, though it is not critical. I do not have any Scrivener, Reedsy or Word documents to include yet.

**Applied:** Obsidian importer moved up to Stage 2 (WP-2.10) because it doubles as the one-time canonical-normalisation pass and as a real-world test corpus. Scrivener importer dropped to `BACKLOG.md`. Still useful to know: roughly how many notes, and do you use Obsidian plugins whose syntax matters (Dataview, Tasks, Excalidraw, Canvas)? Those would import as Raw blocks.

---

## B. Needed before the relevant stage

### Q6. Academic referencing (Stage 6)
Which citation style(s) do you need (APA 7, Chicago, Harvard/ANU variant)? Do you use Zotero or another reference manager? Do you want in-text citation autocomplete (`@smith2020`) with a bibliography generated on export?
**Working assumption:** Pandoc-style `[@key]` citations with CSL styles; bibliography sourced from a `.bib` file in the library (exportable from Zotero via Better BibTeX). APA 7 and Chicago shipped as defaults.

### Q7. Footnotes vs endnotes (Stage 6)
Fiction typically uses none, academic uses footnotes, some publishers want endnotes. Do you want one markdown syntax (`[^1]`) with a per-export switch (footnote / endnote / chapter endnote)?
**Working assumption:** Yes — single syntax, export-time placement.

### Q8. Print targets (Stage 6)
Which trim sizes and platforms? (KDP and IngramSpark both accept standard PDF with embedded fonts; IngramSpark *prefers* PDF/X-1a.) Note: **MOBI is dead** — Amazon stopped accepting MOBI uploads in 2022 and KDP wants EPUB. Plan drops MOBI unless you object.
**Working assumption:** Trim presets for 5×8, 5.5×8.5, 6×9, A5, A4, US Letter; PDF with embedded fonts; EPUB 3; DOCX. PDF/X-1a as a stretch goal.

### Q9. Note "types" (Stage 3)  ✅ built in WP-3.3, list no longer needed
You suggested planning boards may work best as templated, colour-coded note types. Which types do you want initially? Proposal: `note`, `daily`, `scene`, `chapter`, `character`, `location`, `plot-thread`, `source` (reference/reading note), `task-board`, `project-brief`. Types are declared in front matter (`type: character`) so they stay plain markdown.
**Working assumption:** The list above, user-extensible via a `types/` folder of templates.
**Built (WP-3.3):** front matter as proposed, and templates as the extension point — but `_templates/` itself rather than a second `types/` folder, since a template already declares a type and is already a "New X Note" command. **The initial list turned out not to be a question that needed answering:** nothing is seeded, a type exists the moment a note or a template says it does, and `.aml/types.yaml` holds only the colours and icons you choose. Write `type: character` in a note and the type is there. Planning boards as a *view over* a type remain open (Stage 5/7).

### Q10. Groupings (Stage 2) — Boundings are the virtual grouping (decided); the open part is whether automatic clusters are wanted
Three mechanisms can coexist; which are must-haves?
1. **Folders** (physical, one home per file).
2. **Boundings** (virtual, a file can be in many; stored as `.aml/boundings.yaml`).
3. **Automatic clusters** (by tags/links, shown as a graph or facet view).

**Working assumption:** Folders + Boundings in Stage 2; link-graph clusters in Stage 7.

### Q11. Metadata storage (Stage 5)
Outliner columns (label, status, target words, POV, etc.) can live in YAML front matter (portable, visible in any editor, adds a header to every file) or in a per-project sidecar file (invisible, but decouples from the file). 
**Working assumption:** Front matter for per-document metadata; a per-project `project.aml.yaml` for ordering and compile settings.

### Q12. Images and attachments (Stage 1)
Where should pasted/dropped images go? Options: a single `_attachments/` folder at library root; a sibling `<note-name>.assets/` folder per note (Typora default); or per-project `assets/`. Do you need image resizing/compression on paste?
**Working assumption:** Per-project `assets/` folder, filename `YYYYMMDD-HHMMSS-<slug>.<ext>`, optional max-width downscale on paste (configurable).

### Q13. Themes  ✅ answered
Built-in themes only, or user-editable CSS like Typora? Do you want a dark mode? The brief's palette is light-only.
**Answer:** light and dark modes only; colours editable in a settings menu saved to a custom config. **Applied (ADR-010):** Paper/Ink modes, per-token colour editor in Settings → Appearance, saved to `.aml/config.yaml` so it follows you; proposed Ink palette in ADR-010 for on-screen approval at Gate 0. No user CSS, no third theme.

### Q14. Fonts  ✅ answered
"Arial, Times New Roman and a few others." Proposal for the "few others" (all free to bundle and embed in PDFs): **Source Serif 4** (book body), **Literata** (screen reading), **EB Garamond** (classic fiction), **Inter** (UI), **IBM Plex Mono** (code). Arial/Times are OS fonts and cannot be bundled, but are used when present.
**Answer:** all approved. **Applied** in ADR-010.

### Q15. Diagrams (Stage 7)
Text-based (**Mermaid**: flowcharts, mind maps, timelines — AI-friendly, diffs well) vs freehand canvas (**Excalidraw**-style, stored as JSON alongside the note) vs both.
**Working assumption:** Mermaid first (cheap), Excalidraw-style canvas second.

---

## C. Can be decided late

### Q16. Linux build — Tauri gives it almost for free. Want it?
### Q17. Mobile — "any device in my network" is read as Mac/Windows only. Files remain readable by any mobile markdown app that can open an SMB share or a Syncthing folder. Confirm no iOS/Android app is expected.
### Q18. Goals — per session, per day, per project deadline (words remaining ÷ days)? Streaks? **Assumption:** all three, opt-in.  ✅ built in WP-3.4, one part deferred
**Built (WP-3.4):** per-note target and deadline (its own front matter), per-day goal (the Folio's `.aml/config.yaml`), what you wrote today (per device — a session is a fact about the keyboard, ADR-004), streaks, and the words-remaining-÷-days pace. All opt-in. A "session" separate from a day was deliberately not built: one that survives a restart is a day, and one that does not is a number nobody can check. **Per-Project goals wait for Stage 5**, because ADR-011 puts them in `project.aml.yaml` and nothing writes that file yet; the arithmetic is already written and tested.
### Q19. Word count rules — exclude front matter, comments, code blocks, headings? **Assumption:** exclude front matter, HTML comments and code blocks; include headings; configurable.
### Q20. Research pane PDFs — view only, or highlight/annotate? **Assumption:** view + copy-quote-with-page-ref in v1; annotation later.
### Q21. Grammar/style checking — LanguageTool can run on the NAS in Docker and gives AU English grammar. Interested?
### Q22. App name — "AML" collides with "Anti-Money Laundering" in searches and app stores. Not a blocker; noting it.
### Q23. You on two machines at once, both on the NAS share? **Assumption:** rare; the reload-if-clean / prompt-if-dirty rule plus the Conflicts panel handle it. SMB gives no safe way to lock a note for editing.

---

## D. Added 2026-09-09 from your answers

### Q24. Does the DRIVESTOR 2 Pro Gen2 support snapshots on the Folio share?  ✅ moot
Your Q1 answer relies on NAS-side versioning. In Network mode that means ADM's **Snapshot Center**, which needs a Btrfs volume; I could not confirm whether this ARM model offers Btrfs. Please check ADM → Storage Manager → volume file system. If it is EXT4, the backstop becomes a scheduled ADM **Backup & Restore** job (e.g. nightly to a second folder or USB disk), and AML Snapshots carry more of the load. Either way, snapshots and sync are **not backups**: an off-NAS backup (USB or cloud via ADM) is strongly recommended and is outside AML's scope.
**Resolved:** with Synced as default, the NAS-side history is Syncthing's Staggered File Versioning, which works on any file system. Choose the volume file system on install day per `06-NAS-SETUP.md` (Btrfs if offered, otherwise EXT4 is fine).

### Q25. Code-signing budget  ✅ answered: none
Signed installers need an Apple Developer Program membership (≈ AUD 149/yr) and, for Windows, either a paid Authenticode certificate or accepting the SmartScreen "unknown publisher" warning on your own machines. Since this is a personal tool, the plan assumes Apple signing only if you want it, and self-signed on Windows. **Answer:** personal tool, no signing. **Applied:** ADR-012; WP 8.1 rewritten; first-run instructions go on the release page.

### Q26. Obsidian vault details  ✅ answered by default
In plain terms I was asking: how many notes, and have you installed any Obsidian *community plugins* (add-ons from Settings → Community plugins) that add their own syntax to notes. If you don't know what those are, you almost certainly haven't. **Applied:** assume no plugins; the migration is one-time and its report lists anything odd so you can fix it by hand afterwards.
