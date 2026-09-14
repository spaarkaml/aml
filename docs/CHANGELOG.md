# Changelog

All notable changes. Format: one entry per work package.

## Unreleased

## 0.5.1 — 2026-09-14

### The Welcome screen, cut in stencil (2026-09-14)
- **The Welcome screen opens with the monogram**, its three letters cut in one after another (A from the left, M from below, L from the right), then *A meaningful life* and the buttons rise in behind. It plays once each time the screen appears, and not at all with reduced motion.
- The spaced-out "AML" and *Open a Folio to start writing* are gone.

### One top to the window (2026-09-14)
- **The window's title bar and AML's top bar are now the same bar.** There used to be two tops: the system's grey strip with the window buttons, and AML's own bar under it.
- **On a Mac** the red, yellow and green buttons sit at the left end of AML's top bar, and the bar starts after them. In full screen, where macOS hides them, the bar uses the room.
- **On Windows** minimise, maximise and close are at the right end of the top bar, full height, with close turning red under the pointer the way Windows draws it. The window still resizes from its edges and keeps its shadow.
- **Drag the top bar anywhere that is not a button or a tab** to move the window; double-click it to maximise.
- One thing Windows does not give a window without its own frame: the Snap Layouts flyout when you hover maximise. **Win+Z** still opens it.

### A new app icon (2026-09-14)
- **AML has its own icon**: the stencil A, M and L, overlapping, with rounded corners, in light blue and white.
- **Drawn for each system.** On the Mac it sits on a white squircle like Apple's own icons. On Windows it has no plate, and the letters themselves are the icon in a light-blue gradient, the way Windows 11 draws Office and Edge.
- **The small sizes are drawn separately**: at 32px and below, the cuts between the letters are wider and the blue a shade deeper, so a Finder list or a small taskbar still shows three letters rather than a blur.
- **The top bar carries the monogram** instead of the letters AML, in the app's own accent colour, so it is teal in Paper, pale blue in Ink, and follows whatever colours you set in Appearance.
- `pnpm icons` redraws every icon file from the monogram's shapes. No dependency added: it renders with the Chromium that Playwright already brings.

## 0.5.0 — 2026-09-14

### Fix — the window no longer scrolls, and the Browser scrolls only its list (2026-09-14)
- **The whole window could be scrolled on a Mac**, top bar and status bar included — a trackpad flick rubber-banded the page as if it were a web page. The window is now fixed; only the regions inside it scroll, and a scroll that reaches the end of one stops there.
- **The Browser's view switch and *+ Note / + Folder* stay put.** Only the file tree scrolls, inside its own box, and it no longer slides underneath the week at the foot of the panel. Boundings, Search and the Binder scroll the same way.
- **The week tray is part of the Browser now**, not a grey band set into it: a hairline above it, the same quiet uppercase label as the Browser's other headings, today's date in a filled circle the way Calendar marks it, and *Open today's note* as a tinted row rather than a raised button.

### WP-7.3 follow-up — the graph, redrawn (2026-09-14)
- **The graph now reads as a map, not a hairball.** Each Bounding is a softly tinted territory with its name written over it, instead of a scatter of same-coloured dots on an empty field.
- **Notes are beads with a ring of the page around them**, so a dot sitting on a line is visibly on top of it; a note in no Bounding is an open ring. The note a graph is drawn around is larger, with a halo, and notes further out from it are quieter.
- **Links are gentle curves**, coloured by the Bounding they stay inside and neutral between Boundings; two links in opposite directions bend apart rather than overlapping.
- **Names make room for each other.** The most connected notes keep their names when zoomed out, and zooming in makes room for the rest; every name has a halo, so it stays legible over a line.
- **Hover a note for a small frosted card**: its name, its Bounding, its links and its words, with the rest of the graph stepping back.
- **The picture runs edge to edge**, and the controls float over it on glass: the scope and steps at the top, the key at the bottom left, and zoom out / show everything / zoom in at the bottom right. **Hover a Bounding in the key** to bring it forward.
- **The camera frames the graph as it settles**, instead of fitting once to where the notes started and leaving them in a small clump in the middle. A graph of a handful of notes is no longer blown up to fill the screen.
- **Two fingers pan and a pinch zooms**, as everywhere else on a Mac; a mouse wheel still zooms.
- **⌥-click a note to centre the graph on it.** Double-click could not work on the screen, because the first click had already opened the note and closed the graph.
- No dependency added.

### WP-4.1 — Snapshots, and WP-3.5's History screen (2026-09-14)
- **Every note now has a history you never have to think about.** The first time you change a note in a sitting, AML keeps a full copy of it as it was *before* you started; if you keep writing, another every half hour. A note nobody is changing gets none. Snapshots live in `.aml/snapshots/`, mirroring your folders, so they follow the Folio to the other computer and are readable without AML.
- **Click *Saved* in the status bar** to see a note's History — or right-click in the note → *Note History…*, or the palette. Nothing else in the window announces it.
- **See what changed since any snapshot**, paragraph by paragraph with the changed words marked, against the note as it is or against another snapshot; or read the **whole snapshot** as it was.
- **Restore** puts the snapshot's exact bytes back, and first keeps the note as it was as a snapshot called *Before restoring* — so a restore is itself one step you can take back, and there is no "are you sure?".
- **Take snapshot**, with an optional label, for the moments you want to mark: *Sent to supervisor*. Labelled snapshots are kept for ever.
- **AML keeps one itself before it replaces a note's text**: before a restore, and before a Conflicts decision that writes over a note (*Before resolving a conflict*, alongside the Trash copy).
- **A renamed or moved note keeps its history**, and so does a renamed folder.
- **Old snapshots thin out on their own**: all of them for a week, then one a day until 90 days, then only labelled ones — and always a note's newest. Both numbers are in **Settings → Snapshots**, which also says how many the Folio holds and how much room they take.
- Snapshots are written once under names unique to the second, so they never conflict between the two computers, and the Conflicts screen never looks at them.
- No dependency added.

### WP-4.2 — Conflicts (2026-09-14)
- **A note changed on both computers is now a decision, not a duplicate.** When the same file is edited on two machines before they have synced, Syncthing keeps the newer edit and sets the older one aside as `Note.sync-conflict-….md`. AML used to treat that copy as a note of its own — it showed up **twice** in the Browser, Quick Open, search, backlinks and the graph, and nothing said a decision was waiting. Copies are now hidden from all of those and listed in **Conflicts** instead.
- **A chip in the status bar** — `1 conflict`, outlined in the accent — and **a banner on the note itself** when the open note has a copy set aside. Also *Resolve Conflicts…* in the palette.
- **Both versions side by side, paragraph by paragraph**, with the words that differ marked. For each difference: keep what is in place, the set-aside copy, or both. *Take every one from…* does them all at once. Unchanged stretches collapse to the paragraphs either side.
- **Nothing is ever deleted.** Keeping in place sends the copy to the Trash; using the copy or saving a combination sends the replaced version to the Trash too, under a name that says what it was. *Keep both* turns the copy into an ordinary note beside the original. With no Snapshots yet, the Trash is the way back from a wrong choice.
- **A decision is refused if the note changed again while you were deciding**, and the screen shows it as it is now. A choice made about text that is no longer there is never applied to text you have not seen.
- **Boundings, Note Types and settings conflict too** — they are synced files in `.aml/` — and for those every difference starts on *Both*, because one item per line means keeping both sides is almost always right. For a note, nothing is pre-chosen that could lose a paragraph.
- **Unsaved edits over a changed file** get the same screen: the editor's *this note changed on disk* banner now has **Compare**, with *On disk* against *Your edits*.
- **Two-way, for now.** A proper three-way merge needs the version both sides started from, which is a Snapshot (WP-4.1) and does not exist yet. So the screen says where the two differ, never who changed what, and leaves each choice to you.
- It says *written on this computer* or *written on another computer* from the device code Syncthing puts in the copy's name. It does not guess a name: this computer pairs with the NAS, not with the other laptop.

### WP-4.3 — Sync health (2026-09-14)
- **A sync that never finishes now says so.** If Syncthing cannot update some files — the stuck-at-95 % problem from 2026-09-12 — the status bar says *Sync stuck · 4 files* and a banner names them with the reason. If the NAS is connected but nothing has moved for ten minutes, the banner says that too. Both offer *Open Syncthing* and *Dismiss*.
- **Being offline never raises a banner.** Travelling is how AML is meant to be used, and a warning on every trip is one you learn to ignore. Instead the status bar says how long it has been: *NAS offline · seen 3 h ago*.
- **Paused is called paused**, for a paused folder or a paused NAS, rather than looking like a fault.
- The NAS sync screen shows when the NAS was last seen, how many items a folder still needs, which files failed and why, and a button that opens **Syncthing's own view** in your browser for the rare deep dive.

## 0.4.0 — 2026-09-13

Diagrams.

### WP-7.1 — Diagrams (2026-09-13)
- **Right-click in a note → Insert diagram.** A drawing surface with a symbol set built for psychological and influence work rather than for flowcharts: Person, Subject, Group and Institution; Belief, Feeling, Behaviour and Body; Event, Channel, Message, Outcome and Note. Nine kinds of link, because the difference between them is the content of the diagram — influences, both ways, **suppresses** (the systems notation for "stops"), tenuous, transmits, and the three genogram ties: close, conflict, cut off. A link carries a label, which is where a causal loop's `+` and `−` go.
- **Groupings are the big circle**: a circle or box drawn behind everything, with a name. Membership is positional — a group holds whatever is standing in it — and dragging a group moves what it holds, because that is the point of drawing a circle round things.
- **What lands in the note is an ordinary `.svg`** in the note's `assets/` folder, referenced by an ordinary image link. It renders in Obsidian, on the NAS, in Quick Look, in a browser and in a compiled PDF with AML nowhere in the picture — and it is vector, so it is crisp at any size in print.
- **The file carries its own model**, in a `<metadata>` block, the way Inkscape and draw.io do. Re-opening a diagram restores what the shapes *mean* rather than guessing it back from their geometry: an arrow that means "suppresses" comes back as "suppresses". The model is one item per line, deterministically written, so a sync conflict is legible and a diff shows what moved.
- **Editing overwrites the same file.** The note already points at it; writing a new one each time would orphan the old drawing in `assets/` and leave the link showing a stale picture.
- **The editor and the exported file are the same renderer.** The `.svg` written to the Folio is the component tree that was on screen, through `renderToStaticMarkup` — a separate export path would be a second implementation of the same picture, and the two would eventually disagree about something small that nobody notices until a compiled book looks wrong.
- **A diagram brings its own paper.** Text, hairlines and the page follow the reader's light/dark setting so a drawing made in Paper stays legible in Ink; the colours you chose do not change, because they are part of the drawing. The background is painted into the file, so it is readable on any background even where the media query never applies.
- **No Mermaid.** Mermaid decides the layout, and in a formulation, a genogram or a causal loop the position *is* the meaning. A Mermaid fence still round-trips untouched as an ordinary code fence — ADR-001 names it as part of the dialect and never said AML renders it — so no existing file breaks and no ADR needed amending. **WP-7.2 (freehand canvas) is folded into this by decision**: one charting feature, not two.
- Reading a diagram is deliberately forgiving: an unknown kind, tone or link from a later AML degrades to something sensible rather than throwing, and an edge whose ends have gone is dropped rather than drawn into nowhere.
- No dependency added. React was already here.

## 0.3.0 — 2026-09-12

The first release that arrives by itself.

### WP-7.3 — Link graph (2026-09-12)
- **⌘⇧G draws the Folio**: every note, every link, clustered by Bounding in the Bounding's own colour. Notes nothing links to are drawn too — a note with no links is exactly what someone opens a graph to find, and leaving it out would answer a different question.
- **Around this note** walks out one to three steps **in both directions**. A note that is only ever linked *to* — which is most reference notes — would otherwise be a graph of one dot.
- **The clustering is the feature, so it has a test.** Notes in the same Bounding settle closer to each other than to another Bounding's *with no links between any of them*: gravity towards each Bounding's centre, plus a push between the Boundings so they land as separate blobs rather than one even spread with the right neighbours.
- **The same Folio lays out the same way every time.** The seed is a golden-angle spiral with each Bounding starting in its own arc, so nothing depends on chance; a graph that rearranges itself between openings is one you have to re-read from scratch each time.
- **One rule for what a link means.** Edges are resolved through `Index::resolve`, the same rule backlinks and renames use, so the graph and the Backlinks panel cannot disagree — through a memo, because a Folio repeats its link targets far more often than not. Four links between two notes are one edge carrying a weight, not four lines on top of each other.
- Click a note to open it, double-click to re-centre the graph on it, drag one to put it somewhere and it stays. Scroll zooms about the pointer.
- **The Context panel carries the open note's own corner**, one step out and closed by default; two steps in a box that size is a smudge. A note connected to nothing says so rather than drawing a lonely dot.
- Canvas rather than SVG — a thousand notes is three thousand DOM nodes for React to reconcile sixty times a second while the layout settles — and it reads its colours out of `tokens.css`, repainting when the mode changes, so ADR-013 still holds. Reduced motion gets the finished picture rather than no picture.
- Past 1200 notes a graph stops being a picture and becomes a texture: a bigger Folio draws its most-connected notes and says so underneath.

## 0.2.0 — 2026-09-12

The first release AML can install by itself. Install this one by hand; everything after it
arrives through **Updates**.

### Fixes (2026-09-12)
- **Sync could never delete a folder, and stuck just short of done.** The `.stignore` AML writes was missing Syncthing's `(?d)` prefix, which is what says "this file may be deleted along with the folder holding it". macOS leaves a `.DS_Store` in every folder Finder has ever opened, so a folder deleted on the other machine could not be removed here: it sat in the queue for ever — *95%, 0 B, 4 items, all of them directories*. Every pattern now carries `(?d)`, `._*` and the other Apple leavings are covered, and opening a Folio upgrades a `.stignore` that is byte-for-byte one AML wrote (a hand-edited one is left alone). The header was also a `#` comment, which `.stignore` does not have — comments are `//`, so that line was quietly being read as a pattern.
- **The page drifted right as tabs were opened.** `.root`'s grid column was `auto`, which never shrinks below its content's min-content width — and sixteen tabs with a 76px floor each made that content 2968px wide in a 1024px window. The body, the page and the centred text all grew with it. The column is now `minmax(0, 1fr)`, so the tab strip's own `overflow-x` is what gives instead, and the tab you just opened is scrolled into view.
- **Pinning a panel no longer redraws it.** A pinned panel used to be welded flush to the window edge with a hairline, and an unpinned one was a floating card — so pinning rearranged everything in it. Now both are the same card, inset from the window the way a Sonoma sidebar sits inside its own window; pinning only decides whether it stays and whether the page moves over to make room for it. Nothing is ever read underneath a pinned panel.
- **Two Corkboard statuses could share a colour.** Six colours meant a manuscript with five statuses had better-than-even odds of a collision, and a key with one colour against two words explains nothing. The palette is twelve now, and colours are worked out over the whole board at once: each value starts at the colour its own letters choose — so a word usually keeps the colour it has always had — and takes the next free one if that is spoken for. Values are sorted first, so the key is the same on both machines. The dashboard's status list uses the same scale, so a status is one colour on both screens.

### WP-8.2 — Auto-update, and the rest of WP-8.1 (2026-09-12)
- **AML updates itself.** The version in the status bar is now a button: it opens **Updates**, which says what is running, what is on offer and what changed, and has one button — *Update and restart*. A filled chip appears beside it when a release is waiting, the only chip in that bar that is an invitation rather than a state.
- **Checks are silent.** Five seconds after launch — never competing with opening the Folio and the index — then every six hours, and a failure says nothing at all: an aeroplane is not an error message. A check you ask for answers out loud, even when the answer is "nothing".
- **"Not now" is about that version**, not about updating: a later release un-skips itself, because one dismissal must not quietly switch updating off for ever. Whether to check at all is per device (ADR-004), which is why the toggle is on this screen and not in Settings.
- **Releasing is one command.** `node scripts/version.mjs 0.2.0`, commit, tag, push; `release.yml` builds both platforms, signs the update bundles, writes `latest.json` and publishes the release. `docs/RELEASING.md` is the checklist. No installer has to be sent to anyone again.
- **The version now lives in three files that cannot disagree.** `pnpm version:check` runs in `pnpm check`: a drift between `package.json`, `Cargo.toml` and `tauri.conf.json` ships an installer whose About box lies about which release it is, and an updater that never sees itself as out of date.
- **`latest.json` is built from the signatures the bundler produced**, never from a list typed by hand, and a release whose second platform failed to sign *fails* rather than quietly leaving that machine behind. The release is published rather than drafted, because a draft has no `releases/latest` — every installed copy would go on reporting it was already current.
- **Signed, but not code-signed.** ADR-012 still buys no Apple or Authenticode certificate. Tauri's updater has its own free minisign key: the private half is a repository secret, the public half is in `tauri.conf.json`, and a bundle without a matching signature is refused before it is unpacked — so the download does not have to be trusted, which matters more for an app with no OS signature, not less.
- **Windows updates go through the NSIS `-setup.exe`**, which installs for the current user, so an update never asks for an administrator password. The MSI is still published for a per-machine install but cannot update itself.
- The updater is a Rust command like everything else that touches the network (ADR-001); the webview asks and is told. Its errors are their own type rather than `FolioError` — nothing here is about a Folio — and a refused signature is deliberately never reported as a network problem: the same Rust type, opposite meanings for the person reading it.

### Fix — macOS builds were refused as "damaged" (2026-09-12)
- Tauri's bundler left the executable linker-signed and **the bundle itself unsigned**: no `_CodeSignature/CodeResources`, so `codesign --verify` failed and Gatekeeper refused a downloaded copy with *"AML is damaged and can't be opened"* — a hard block that right-click → Open cannot get past. Every DMG built before today has this fault.
- `bundle.macOS.signingIdentity: "-"` ad-hoc signs the whole bundle at build time. The app now verifies `--deep --strict`, carries its real identifier (`com.brycereeves.aml`, not the linker's `aml-903c6d268b7aae11`), and the bundled Syncthing validates inside it.
- This needs no certificate, no Apple Developer account and no notarisation, and conveys no trust — Gatekeeper still calls AML unidentified, which right-click → Open bypasses. ADR-012 carries a proposed amendment saying so; it needs Bryce's yes.
- An existing install refused this way is fixed with `xattr -dr com.apple.quarantine /Applications/AML.app`.

### WP-5.8 — Project dashboard (2026-09-12)
- **The Project's own goal, at last.** WP-3.4 attached goals to a *note* because ADR-011 puts a book's goal in `project.aml.yaml` and nothing wrote that file yet. It does now: `target` and `deadline` are manifest keys, so a book's goal follows the book between machines, and the arithmetic is the same tested arithmetic — progress, days left, words a day.
- Progress counts **the words a compile would take**, not every word in the folder: a chapter you have decided to leave out is not progress towards the book.
- Words, compiled words, documents, parts and — only when there are any — how many documents are left out. **Where the words are** is by part with a bar against the longest, the same shape as Statistics' per-heading table one level up; **by status** is the other axis, with the documents that have no status listed last rather than hidden, because untouched is a state too.
- Title, target and deadline are edited here, and are the only things on the screen that write to the manifest.

### WP-5.3 — Corkboard (2026-09-12)
- **One card per document**, grouped by part, in Binder order: what the book is about, at a glance.
- **The board holds nothing of its own.** A card's synopsis, label and status are the note's own front matter (ADR-004), so what you type is legible in the file, in the Properties panel and to anything else that reads markdown. There is no board file and nothing to reconcile — and writing one changes exactly one line of the note, leaving key order, comments and quoting style as they were.
- **Moving a card moves the document.** There is one order and the Binder is it, so a card drag runs the same plan a Binder drag runs.
- **Colour by status, by label, or off.** The values are free text, so nobody chose the colours: they are a stable hash over the ADR-010 palette, which means the same word is the same colour in every Project, on every machine, for ever — with a key beside the control saying which is which. The colour is a band at the head of the card and never the whole card: a tinted card makes its own text harder to read, and the text is the point.

### WP-5.2 — Binder panel (2026-09-12)
- **Inside a Project the Browser becomes the book**: parts and documents in reading order, which is the order a compile will use. The Folio tab becomes the Binder rather than a fourth tab joining the three WP-3.10 settled on, and the panel's header is the way back out.
- **A Project chip in the top bar** names the book and opens its dashboard. Which Project you are in is per device and per Folio (ADR-004) and is remembered between launches.
- **Dragging: order is the manifest, nesting is the disk.** A row's outer thirds are an insertion line and nothing on disk moves; a part's middle third nests, which *moves the file*, because the Binder's structure is the folder's and there is no second truth to keep in step. The move happens first — a rename that failed must not leave an order pointing at somewhere the note never went — and it goes through the same rename that offers to rewrite links into the moved note.
- **Include in the compile**: the tick at the end of each row, quiet when it is on because being in the book is the ordinary state. Excluding a part excludes everything under it, so only the part is written down.
- **Split at cursor (⌘⇧K).** Everything after the caret becomes a new document beside this one, named after its first heading, placed straight after it in the Binder, and opened. A caret at the top of a block splits *above* it, so the half left behind keeps no empty heading. The tail is written to its own file **before** a character is removed from the note it came from, so a failure anywhere leaves the text in two places rather than none — which is what makes it safe without the snapshot engine ADR-006 wants and WP-4.1 will build.

### WP-5.1 — Project manifest (2026-09-12)
- **A folder with a `project.aml.yaml` is a Project**: an ordered Binder, what a compile leaves out, and the book's own goal.
- **The folder is the structure; the manifest is the order.** A part is a folder, a document is a note, nesting is nesting. Two trees would need reconciling on every sync, every rename and every file dropped in by hand, and one of them would always be wrong.
- **Nothing in the manifest is load-bearing.** The Binder is reconciled against the folder on every read: a note that arrived over Syncthing appears whether or not it is listed; a line naming a note that has gone is ignored on screen but kept in the file, because the likeliest reason a note is missing is that it has not synced yet. Reading a Project never writes to disk. Delete the manifest and you have a folder of markdown in alphabetical order, which is what you had before.
- **One item per line**, paths relative to the Project folder, and leaving a scene out of the compile is *adding a line* to `exclude:` rather than editing one — the same merge argument that shapes everything under `.aml/`.
- **Keys this version does not understand are kept.** Stage 6's compile presets will live in this file, and ADR-004's rule is that an older AML must never silently drop a newer one's settings; a test writes a `presets:` block through a full read-modify-write cycle and asserts it survives.
- **Per-item metadata is front matter.** `synopsis`, `label` and `status` are keys in the document, not rows in the manifest — legible everywhere, and nothing to keep in step. `front_matter.rs` changes one line and leaves the rest of someone's YAML exactly as they wrote it.
- Word counts and card properties come from the index in one query per Project, the way `types_by_note` does; a Folio still indexing shows zeroes rather than failing.
- A new `book` icon, "Make this a Project" in the Browser's folder menu, and "New Project…" on the Overview, which now lists real Projects instead of a promise about Stage 5.

### WP-3.9 — Callouts as nodes (2026-09-12)
- **`> [!warning] Read this` is what it looks like now** — a tinted panel with a coloured bar and a real, editable title — instead of a monospace Raw chip. Not a byte of what is written to disk changes: the corpus file moved from *expect: raw* to *expect: lossless*, which is Quality Gate 3's "callout Raw count is 0".
- **Read from the blockquote's own source, not from the parse tree.** mdast joins the title line and the first body line into one paragraph with a soft break; separating them again inside the tree means splitting text nodes around a newline. Reading the lines that are already there is both simpler and exact — and because both halves are then parsed as markdown in their own right, emphasis in a title survives, a `[[wiki link]]` in the body is still a wiki link, and a callout nested inside another becomes a nested callout for free.
- **Written back by hand, on purpose.** The body has to sit on the lines straight after the head; a stringifier would put a blank `>` between them, and parsing that back gives a different document from the one written — the round trip would drift on every save.
- The title is a child node with inline content rather than a string, so ADR-003's second rule still holds: nothing about a title is lost, and it is ordinary editable text.
- An invented kind is kept, not rewritten to one AML knows. Four tones (info, done, warn, danger) rather than one colour per kind, so a Folio full of invented kinds still reads sensibly; a callout with no title of its own shows the kind's name, so a coloured bar is never unexplained.
- `/callout` in the slash menu (and *Format › Callout* in the palette) inserts one.
- **Fixed a file-rewriting bug found on the way:** `> [!note|left]` — Obsidian's layout hint — did not match the old callout pattern, so the block became an ordinary quotation and the serialiser escaped its `[`, rewriting the file on the first save. It round-trips byte-identically now.
- Three new colour tokens (`--aml-callout-done/-warn/-danger`), each clearing 4.5:1 against the page because a callout's title is text — which is why danger has a darker relative of its own rather than borrowing `--aml-accent`, which ADR-010 says is never text in light mode.

### WP-3.7 — Statistics (2026-09-12)
- **Click the word count** in the status bar (or *Statistics…* in the palette) for the note's figures: words, characters with and without spaces, sentences, paragraphs and reading time.
- **Every figure counts the same text the status bar counts** — Q19's rules, from one place: front matter, code blocks and HTML comments are not prose; headings, lists, tables and quotes are. Two counters with different opinions would be worse than either being wrong, so the e2e asserts the panel's figure against the status bar's.
- **Readability** as Flesch reading ease and Flesch–Kincaid grade, with the band ("Plain English", "Difficult") leading because that is the part worth acting on. Below twenty words there is **no number at all**: a grade level computed from a sentence and a half is not a measurement, and printing one would invite trusting it.
- **Where the words are** — every heading with the words in its section, its subsections included, which is the number that answers "how long is chapter three". Same definition of a section as the Outline uses, so the two agree; a bar against the longest, because which chapter has run away with itself is easier to see than to read.
- Sentences are counted per block with a floor of one, reusing Focus Mode's own sentence boundaries — a heading with no full stop is one sentence, not none.

### WP-3.4 — Goals (2026-09-12)
- **A target for the note**, written as one of its own properties (`target_words`, and `deadline` if it has one) — so it travels with the note, opens in any other editor, and is searchable. The Goals section sets it; the Properties panel shows it as the ordinary field it is.
- **A target for the day**, saved in the Folio (`goals.daily`), so both machines aim at the same number.
- **An honest count of what you wrote.** The tally follows the difference in the word count, so opening a 4,000-word chapter adds nothing, switching notes only moves the mark, and deleting counts against you — because it is not writing. It is per device (`localStorage`, ADR-004): a session is a fact about this keyboard, and two machines' sessions must never add up to something neither of them wrote.
- **The ring** sits in the status bar whenever there is a daily goal, in ADR-013's accent — the colour that ADR named for exactly this — turning to AML's own teal when the goal is met, so "done" reads as arrival rather than as a warning. Click it for the Goals section.
- **Deadlines** give Q18's words-remaining-÷-days, with today counting as a day you still have. A deadline that has passed or a target already met produces no number at all: "write 4,000 words a day" for a day that has gone is not information.
- **Streaks** survive the morning. Today does not count against you until it is over, so an unmet today is skipped rather than breaking the run.
- Everything is off until set. A goal you did not set is not a goal you are failing.
- **Not done, and why:** per-Project goals with a deadline. ADR-011 puts those in `project.aml.yaml` and nothing writes that file until Stage 5. The arithmetic is built and tested against the unit that exists today — the note — and the same functions will serve a Project when there is one.

### WP-3.3 — Note Types (2026-09-11)
- **A note can say what it is** — `type: chapter` in its own front matter, as Q9 settled, so nothing leaves plain markdown and nothing has to be migrated. It was already indexed and already searchable as `type:chapter`; what this adds is everything around it.
- **Nothing is seeded.** A type exists the moment a note or a template says it does. AML finds them three ways — the `type:` a template declares, the `type:` values notes are actually using, and anything you have customised — and the union is the list.
- **A type's two halves are kept apart on purpose.** What a type *means* lives in `_templates/`: the template that declares `type: chapter` is what makes a chapter, and the front-matter keys it carries are the properties a chapter has. What a type *looks like* — a colour and an icon — lives in `.aml/types.yaml`, synced, one field per line.
- **That file holds only your decisions.** A type back at AML's own colour and icon is removed from it rather than written out, and a Folio where nothing has been customised has no file at all. Until you choose, a type's colour is a hash of its name over the ADR-010 palette — so it is the same colour on both machines before the file has even travelled.
- **In the Browser**, a typed note wears its type's mark instead of the generic page icon, in the same slot, so rows do not shuffle. An untyped note is the ordinary case and keeps the page.
- **In the Properties panel**, a picker over the types the Folio knows — a value you can choose rather than one you have to spell. `type` no longer appears twice: the picker is the editor for it, and the YAML view still shows everything.
- **Type-specific properties:** under the picker, the fields this type's template declares and this note has not got, each one click away. The type says what a chapter carries; the note keeps plain YAML.
- **Settings → Note types** lists every type found with its notes count, the command that makes one, its fields, and a colour well and an icon box. There is deliberately no "New type" button — you make a type by writing one.

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
