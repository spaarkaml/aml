# AML — Architecture Decision Records

Each ADR states the decision, the alternatives considered, and why. Accepted ADRs are the contract every AI coding session must respect (see `04-AI-DEVELOPMENT-PLAYBOOK.md`). Change an ADR by adding a new one that supersedes it — never by silently editing code.

Status legend: `PROPOSED` · `ACCEPTED` · `SUPERSEDED`
Decision log: 2026-09-09 — Bryce answered Q1–Q5; ADR-003, 005, 006, 011 rewritten. Later the same day: NAS is a blank slate so ADR-005 flips to Synced-by-default; ADR-010 accepted (light + dark, colour editor, fonts approved); no code signing (ADR-012).

---

## ADR-001 — Application shell: Tauri 2 (Rust core + web UI)  `ACCEPTED`

**Decision:** Build with **Tauri 2**. Rust hosts the file system, indexing, network-share access, and export sidecars; the UI is TypeScript/React rendered in the OS webview (WebKit on macOS, WebView2 on Windows).

| Option | For | Against |
|---|---|---|
| **Tauri 2** | ~10 MB shell, native FS speed, first-class sidecar binaries (Pandoc, Typst, optional Syncthing), signed installers for both OSes from one repo | Two webview engines → occasional CSS differences; Rust kept thin so AI-generated Rust stays tractable |
| Electron | Single Chromium; Typora and Obsidian prove the model | 150–250 MB installs, slower for large-corpus indexing |
| Flutter | One codebase | No mature rich-markdown editor; would mean writing one |
| Native (Swift + WinUI) | Best OS fidelity | Two codebases, double the AI regression surface |

**Guardrail:** Rust commands are the *only* way the UI touches disk or network shares. No `fs` access from the webview.

---

## ADR-002 — Language & framework choices  `ACCEPTED`

- **UI:** React 18 + TypeScript (strict). Largest body of high-quality examples for AI generation; ProseMirror/Tiptap bindings are mature.
- **State:** Zustand (small, explicit stores).
- **Styling:** CSS custom properties (design tokens) + CSS Modules. No Tailwind — themes must be plain CSS so they can be restyled without a build step.
- **Rust:** `tauri`, `tokio`, `notify` (local file watching), `rusqlite` (index), `serde`, `blake3` (change detection). Type-safe bridge via **tauri-specta** — TS types generated from Rust commands.
- **Testing:** Vitest (unit), Playwright via `tauri-driver` (end-to-end), `cargo test`. Round-trip corpus for markdown fidelity (see ADR-003).
- **Tooling:** pnpm, Biome, `cargo clippy -D warnings`, GitHub Actions matrix (macos-latest, windows-latest).

---

## ADR-003 — Editor engine: WYSIWYG on ProseMirror (Tiptap), markdown as the interchange format  `ACCEPTED` *(spike WP-1.2 confirmed Tiptap 3 + own remark bridge on 2026-09-09)*

**Your decision (Q4):** polish first; `.md` is the storage/interchange format the software interprets, not the thing you look at.

**Decision:** The editor is a **ProseMirror document** (via **Tiptap**), parsed from markdown on open and serialised to markdown on save. The on-disk format is a **canonical AML markdown dialect** (GFM + front matter + `[[wikilinks]]` + footnotes + `[@citations]` + Mermaid fences), always written in one deterministic style.

**Library choice (confirmed by WP-1.2):** Tiptap 3 with our own mdast↔ProseMirror bridge. `@tiptap/markdown` rejected (no Raw guarantee, no canonical-style control).
| Candidate | For | Against |
|---|---|---|
| **Tiptap 3 + markdown bridge** (preferred) | Largest ecosystem and AI training data; tables, images, task lists, collaboration-free; extension model is clean for wikilinks/citations | Markdown parse/serialise is a bridge we own (remark/mdast ↔ ProseMirror) or Tiptap's markdown package if it covers GFM + footnotes at build time |
| Milkdown | Markdown-first ProseMirror (remark built in); closest fidelity out of the box | Smaller community; customising its transformer for our dialect is harder |
| CodeMirror 6 live preview | Lossless | Rejected by Q4: editing feel is source-like, not WYSIWYG |

**Consequences and the rules that come with them**
1. **Files are normalised on save.** Every save rewrites the note in canonical style (ATX headings, `-` lists, `*emphasis*`, `**strong**`, fenced code, one blank line between blocks, LF line endings, trailing newline). Other tools will see reformatting the first time AML saves a file. The Obsidian importer (WP-2.10) normalises everything once so later saves are stable.
2. **Nothing is silently lost.** Any block or inline the parser does not model becomes a **Raw** node: shown in the editor as a monospace "raw markdown" chip you can edit, and written back verbatim. HTML blocks, unknown fences, Obsidian callouts (until modelled) all survive.
3. **Fidelity gate is semantic, not byte-level.** Test = parse → serialise → parse; the two ASTs must be equal, and a second serialise must be byte-identical to the first (idempotent). The corpus of ~60 files covers every syntax we support and several we don't (Raw pass-through).
4. **Syntax reveal is an enhancement, not the model.** Typora-style "show `**` while the caret is inside bold" is a Stage 3 WP (3.8), implemented as decorations over the rich document.
5. **Front matter** is a folded properties panel, never shown as YAML unless asked.

---

## ADR-004 — Storage model: plain markdown, front matter, one manifest per Project  `ACCEPTED`

- Every note is UTF-8 `.md` with optional YAML front matter. No proprietary database holds user content.
- Per-note metadata (`type`, `status`, `label`, `target_words`, `tags`, `aliases`, `created`) in front matter.
- A Project folder contains `project.aml.yaml`: ordered Binder tree, compile presets, goals. One item per line so NAS-side or offline-copy merges are simple.
- Folio-wide settings in `.aml/config.yaml`; Boundings in `.aml/boundings.yaml`.
- **Per-device** state (window size, open tabs, layouts, index cache) in the OS app-data folder — never inside the Folio. This matters more now that the Folio may live on a network share: SQLite must not run over SMB.
- A derived **SQLite index** (local app-data, `index.sqlite`, one per Folio) holds FTS5 full text, links, tags, headings, word counts. Rebuildable from the files; never the source of truth.

---

## ADR-005 — Folio location: Synced (bundled Syncthing) by default; Local and Network (SMB) as alternatives  `ACCEPTED`

**Context:** the DRIVESTOR is being installed fresh (Q3 follow-up, 2026-09-09) and Bryce asked for a lead on the best arrangement. With no existing setup to preserve, the arrangement that best meets the brief — NAS as the single hub, every device in sync, works when travelling and catches up on return, versioning on the NAS — is Syncthing. No better alternative exists for a home-only, no-cloud, cross-platform sync with versioning: Asustor's own EZ Sync client cannot be bundled or scripted; Resilio is proprietary; Nextcloud is a server to maintain; rclone bisync is fragile with concurrent edits.

**Decision:** A Folio has a **location type**:

| Type | Where the files are | Watching | History backstop | Ships |
|---|---|---|---|---|
| **Synced** *(default)* | A local folder on each machine, kept identical to the NAS folder by **Syncthing bundled inside AML** as a sidecar (MPL-2.0; nothing separate to install on Mac/Windows) | OS file events (`notify`) + Syncthing REST for status and conflict files | AML Snapshots (ADR-006) **and** Syncthing Staggered File Versioning on the NAS folder | Stage 1 |
| **Local** | A folder on this machine only | OS file events | AML Snapshots | Stage 1 |
| **Network** | An SMB share on the NAS mounted by the OS; AML opens it directly | Polling (3 s tree scan while focused) — FS events are unreliable over SMB | AML Snapshots + NAS snapshots/backup job | Stage 4 (optional) |

**How Synced works for you**
- AML starts its Syncthing sidecar in the background on launch and stops it on quit (or leaves it running, per setting). Pairing with the NAS is a one-time screen: paste the NAS's Device ID (or scan its QR), accept on the NAS, choose the Folio folder. AML writes the Syncthing config; you never open Syncthing's own UI unless you want to.
- **Travel needs no special mode.** Leave the network; keep writing; on return Syncthing reconciles. If the same note changed on both sides, Syncthing writes a `*.sync-conflict-*` file and AML's Conflicts panel shows a side-by-side merge.
- The NAS is always the hub; a second computer pairs with the NAS, not with the first computer. Both can be online at once.
- Excluded from sync (`.stignore`): OS junk (`.DS_Store`, `Thumbs.db`), editor temp files. Everything under `.aml/` (snapshots, dictionary, boundings, config) **is** synced so it follows you.
- Per-device state and the SQLite index stay in local app-data (ADR-004).
- Atomic writes (temp + rename) so Syncthing never ships a half-written file.

**Fallback:** if Syncthing turns out not to be installable on this DRIVESTOR model, Network mode (Stage 4 WP moves up) covers the same NAS with the OS's SMB client; see `06-NAS-SETUP.md` for the check.

**Rejected as default:** Network (SMB). Reasons: no file events over SMB, every open is a network round-trip, Wi-Fi drops mid-save, and travel needs a hand-built Offline Copy / Return merge. It stays as an option because it needs no sidecar.

---

## ADR-006 — History: timed Snapshots inside the Folio, NAS versioning underneath  `ACCEPTED`

**Your decision (Q1):** a save every 30 minutes plus NAS-side versioning is enough.

**Decision (with one clarification):**
- **Continuous save.** The note on disk is written ~1 s after typing pauses and on blur/close. Losing 30 minutes of work is never acceptable; "every 30 minutes" is the *snapshot* cadence.
- **Snapshots.** A snapshot is a full copy of the note at `.aml/snapshots/<note-path>/<YYYYMMDD-HHMMSS>[-label].md`. Taken automatically every 30 minutes while the note has changed since its last snapshot, on manual "Snapshot…" (with a label), and before destructive operations (restore, rename-with-link-update, Return-merge overwrite).
- **History UI.** Per-note timeline, diff between any two snapshots or against the current text, restore. Restore takes a snapshot first.
- **Retention.** Keep all for 7 days, then daily for 90, then labelled only; configurable. Snapshot folders count toward Folio size and are shown in Settings.
- **Backstop.** Network: ADM Snapshot Center on the share (if available) or a scheduled ADM backup job; Synced: Syncthing Staggered File Versioning on the NAS folder. AML shows a one-time checklist for whichever applies.

**Rejected:** content-addressed object store with JSONL logs (previous proposal — more than Q1 asks for); embedded git.

---

## ADR-007 — Search & index: SQLite FTS5 in Rust  `ACCEPTED`

- Indexer runs in Rust on a background thread. Incremental via file events (Local/Synced) or the polling scan (Network); full rebuild on demand.
- Query language: `path:`, `tag:`, `file:`, `type:`, `status:`, `bounding:`, `has:image`, `"exact phrase"`, `/regex/`, `-exclude`, `OR`, grouping.
- Quick Open uses a separate in-memory fuzzy index (filenames, aliases, headings) for <10 ms response.
- **Network note:** initial index of a Folio over SMB reads every file once; budget 5k notes in < 60 s over gigabit, with a progress bar and a usable UI meanwhile. Subsequent opens use the local index and only re-read changed files.

---

## ADR-008 — Export & typesetting: Pandoc + Typst sidecars  `PROPOSED` (needs Q6–Q8)

- Markdown → **Pandoc** AST → DOCX, EPUB 3, HTML, Typst; citations via citeproc + CSL.
- **Typst** sidecar renders print PDFs from Book Designs (Typst templates). PDF/A natively; PDF/X-1a as a stretch post-process.
- "Compile" = a Preset stored in `project.aml.yaml`.
- Because the editor is WYSIWYG (ADR-003), export works from the canonical markdown the app writes — one code path, no editor-state export.

---

## ADR-009 — Spelling: bundled Hunspell en_AU  `ACCEPTED`

- `en_AU` Hunspell dictionary bundled; checked in Rust and surfaced to the editor as decorations.
- Personal dictionary at `.aml/dictionary.txt` (inside the Folio, so it follows you).
- Ignore rules: code, URLs, front matter, wikilink targets, citation keys.

---

## ADR-010 — Appearance: light and dark modes, user-editable colours, approved fonts  `ACCEPTED` *(Paper colour table and UI font superseded by ADR-013)*

**Decision (Q13, Q14):** two modes only — **Paper** (light) and **Ink** (dark) — following the OS or set manually. Every colour token is editable in **Settings → Appearance** (colour pickers per token, per mode, with "Reset to AML"). Edits are saved to the Folio's `.aml/config.yaml` under `appearance:` so they follow you between devices; a per-device override toggle exists for the one machine you want different. No user CSS files, no third theme.

**Paper (light) tokens — from the brief**

| Token | Hex | Role | Contrast vs Paper |
|---|---|---|---|
| `--aml-bg` | #FAEFED | App and page background | — |
| `--aml-surface` | #FFFFFF | Cards, panels, popovers | — |
| `--aml-text` | #1F2A2E *(derived)* | Body text | 13 : 1 ✅ |
| `--aml-primary` | #006078 | Headings, links, active states, primary buttons | 6.3 : 1 ✅ text |
| `--aml-muted` | #82BAC4 | Borders, inactive icons, rules | 2.0 : 1 — decorative only |
| `--aml-highlight` | #FFD4D1 | Selection, hover, current line | surface only |
| `--aml-accent` | #E37C78 | Goal progress, warnings, destructive, unsaved dot | 2.5 : 1 — never text in light mode |

**Ink (dark) tokens — derived, for approval at Gate 0**

| Token | Hex | Role | Contrast vs Ink bg |
|---|---|---|---|
| `--aml-bg` | #17262B | Background (teal-tinted near-black) | — |
| `--aml-surface` | #1F3238 | Cards, panels | — |
| `--aml-text` | #F0E9E7 | Body text (Paper-tinted white) | 12.9 : 1 ✅ |
| `--aml-primary` | #82BAC4 | Headings, links, active (Sea Glass becomes the primary in dark) | 7.3 : 1 ✅ |
| `--aml-muted` | #2F4A52 | Borders, rules | decorative |
| `--aml-highlight` | #3A2E31 | Selection, current line (Blush darkened) | surface only |
| `--aml-accent` | #E37C78 | Accent — passes as text in dark | 5.5 : 1 ✅ |

The editor page in Ink uses `--aml-surface` under the text with `--aml-bg` around it, so the "page on a desk" reading is kept in both modes.

**Fonts (approved):** UI = Arial/Helvetica with Inter optional; editor default = Times New Roman with **Source Serif 4** bundled (also the default Book Design body face); **Literata** (screen reading), **EB Garamond** (classic fiction), **IBM Plex Mono** (code). Font choice lives in Appearance next to colours. Arial and Times New Roman are used from the OS and are not bundled.

---

## ADR-011 — Naming  `ACCEPTED`

| Concept | Name | Usage |
|---|---|---|
| The root folder | **Folio** (plural Folios) | "Open Folio…", "Folio Browser", `Folio` type |
| Virtual grouping (many-to-many) | **Bounding** (plural Boundings) | "Bounding: Thesis", "Add to Bounding" |
| Physical folder with a manifest | **Project** | "New Project", Binder lives here |
| Home screen | **Overview** | Boundings and Projects as clusters |

The words "vault", "collection", "study", "library" and "workspace" are not used for these concepts anywhere in code, UI or docs. CI greps for `vault` and fails.


---

## ADR-012 — No code signing; local-only updater  `ACCEPTED`

**Decision (Q25):** personal tool, no Apple Developer or Authenticode certificates. Builds are unsigned.

**Proposed amendment, 2026-09-12 — ad-hoc signing on macOS (needs Bryce's yes).** "Unsigned" turned out to mean two different things on Apple Silicon, and the weaker one does not run. Tauri's bundler left the *executable* linker-signed and the **bundle itself unsigned**, so there was no `_CodeSignature/CodeResources`; `codesign --verify` failed with "code has no resources but signature indicates they must be present", and a quarantined copy is refused by Gatekeeper with **"AML is damaged and can't be opened"** — a hard block that right-click → Open cannot bypass. Every DMG built before today has this fault.

The fix is `bundle.macOS.signingIdentity: "-"` in `tauri.conf.json`, which ad-hoc signs the whole bundle at build time. This is **not** what this ADR rejected: an ad-hoc signature uses no certificate, no Apple Developer account, no notarisation and costs nothing; it conveys no trust and Gatekeeper still calls the app unidentified. It is only what makes an arm64 bundle launchable at all. Nothing about the updater's own minisign key changes.

If accepted, this ADR's decision line should read "no Apple Developer or Authenticode certificates; macOS builds are ad-hoc signed so that the first-run instructions below actually work." First-run instructions are shown on the release page and in `06-NAS-SETUP.md` §Install: macOS right-click → Open (or remove the quarantine attribute); Windows SmartScreen → More info → Run anyway. The in-app updater still works: Tauri's updater signs update bundles with its own free minisign key, unrelated to OS code signing. Revisit only if the app is ever shared.

---

## ADR-013 — Visual foundation: Apple-light ("Sonoma"), neutral Paper chrome  `ACCEPTED`
*Supersedes the Paper colour table in ADR-010 and its UI-font choice. Everything else in ADR-010 — two modes, seven editable tokens per mode, `.aml/config.yaml`, the per-device override, the Ink table, the four bundled reading faces — stands unchanged.*

**Context.** ADR-010 decided *colour* and *reading faces* and nothing else. It left the type ramp, spacing rhythm, corner radii, elevation, iconography, control density and motion undecided, so they were improvised per component: one 11–12px size everywhere, 4px radii on everything from a colour swatch to a modal, every panel walled off with a 1px border, icons typed as literal characters (◧ ◨ ↺ ✎ ▸), `opacity: 0.6` standing in for a secondary text colour, and no motion at all. The result was consistent but unfinished, and every stage after this one adds panels that would inherit it. Bryce reviewed three directions on a design canvas (2026-09-11) and chose **A — Sonoma**: native macOS light, neutral greys, AML's teal kept as the accent.

**Decision.** AML's chrome follows the macOS light idiom. The foundation below is decided here and is not per-component.

**Paper (light) tokens — the seven editable ones**

| Token | Was (ADR-010) | Now | Role | Contrast |
|---|---|---|---|---|
| `--aml-bg` | #FAEFED | **#F5F5F7** | Window chrome: toolbar, sidebars, status bar | — |
| `--aml-surface` | #FFFFFF | **#FFFFFF** *(unchanged)* | The page, cards, popovers | — |
| `--aml-text` | #1F2A2E | **#1D1D1F** | Body text | 15.5 : 1 ✅ |
| `--aml-primary` | #006078 | **#006078** *(unchanged)* | Headings, links, active states, selection fill | 6.6 : 1 ✅ |
| `--aml-muted` | #82BAC4 | **#D8D8DD** | Hairlines, rules, inactive icons | 1.3 : 1 — decorative |
| `--aml-highlight` | #FFD4D1 | **#E8E8ED** | Hover and row selection fill | text on it 13.8 : 1 ✅ |
| `--aml-accent` | #E37C78 | **#E37C78** *(unchanged)* | Unsaved dot, warnings, destructive, goal progress | 2.6 : 1 — never text |

AML's teal and coral survive; what goes is the warm rose *ground*. Teal now does what an accent colour does on macOS — it marks the selected row, the active control, the link — rather than competing with a tinted background for attention.

**Foundation — decided here, not editable**

- **Interface face:** the system UI face (`-apple-system` → SF Pro on macOS, Segoe UI Variable on Windows), replacing Arial. The four bundled *reading* faces of ADR-010 are untouched; this is the chrome, not the page.
- **Type ramp:** 11 / 12 / 13 / 15 / 19 / 26 px with weights 400 / 510 / 590 / 680. 13px is the default interface size (macOS's own); 11px is reserved for metadata.
- **Secondary and tertiary text** are tokens derived from `--aml-text` with `color-mix` — 62% (4.6 : 1, passes AA) and 50% (3.2 : 1, AA-large, metadata only). `opacity` on a text element is no longer how hierarchy is expressed, because it dims the element's background and focus ring too.
- **Spacing:** 2 · 4 · 6 · 8 · 12 · 16 · 24 · 32 · 48, named `--aml-space-N` where N × 4 = the value. Rows are 28px, not 22px.
- **Radii:** 6 (inputs, chips, swatches) · 8 (buttons, rows, menu items) · 12 (cards, panels, popovers) · 16 (sheets and dialogs) · 999 (pills). One 4px radius for everything is gone.
- **Elevation instead of walls.** Panels, popovers and dialogs are separated by a ½px ring plus a shadow (`--aml-shadow-1/2/3`), not by 1px borders. Borders remain only where two *regions* meet (sidebar ↔ content, status bar ↔ body).
- **Icons** are a drawn 16px stroke set in `src/app/icons.tsx` (1.3px stroke, round caps, `currentColor`), not typed characters. Keyboard glyphs (⌘ ⌥ ⇧ ⌃) stay as characters — those are correct Apple typography.
- **Motion:** 120 / 180 / 240 ms on `--aml-ease`. Every transition is suppressed under `prefers-reduced-motion: reduce`, globally, in one rule.

**Consequences**
1. `docs/qa/contrast-report.md` is regenerated; the unit test that pins one pair to the report moves with it.
2. The Appearance screen's "Reset to AML" now restores these values. Anyone who had edited the old Paper colours keeps their edits — they are in `.aml/config.yaml` and override the defaults exactly as before.
3. **Ink is unchanged in colour** and gets the same foundation. Re-deriving Ink onto a neutral ground is deliberately *not* done here: the Ink palette approval has been outstanding since Gate 0, and doing both at once would put an unapproved palette on top of an unreviewed layout. That is a follow-up once Bryce signs off Ink on screen.
4. ADR-002's "CSS custom properties + CSS Modules, no Tailwind" is what makes this a token change rather than a rewrite, and is reaffirmed.

**Rejected:** *B — Warm Desk* (Apple structure over AML's cream page; kept ADR-010 intact but read as a warmer version of the same app rather than a modern one). *C — Studio* (Pages-like floating sheet, icon rail, note list with previews; best-looking of the three but a layout change costing roughly twice as much, and it would have pre-empted Stage 5's Binder). Both remain on the canvas if the decision is ever revisited.
