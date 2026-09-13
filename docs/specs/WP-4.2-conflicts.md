# WP-4.2 — Conflicts
**Stage:** 4 · **Depends on:** 1.1, 1.1b, 2.1 · **ADRs:** 001, 004, 005, 006, 011, 013 · **Sessions:** 1

**Built before WP-4.1 (Snapshots) by decision, 2026-09-14.** The plan's "base = latest
Snapshot" cannot exist yet, so the comparison is two-way. See "No common ancestor" below.

## Goal
When the same file is changed on two computers before they have synced, show both versions
side by side and let the writer decide what to keep — without ever losing text they have not
looked at.

## What was wrong before
Syncthing already handles the collision safely: it keeps the newer edit in place and renames
the older one `Name.sync-conflict-YYYYMMDD-HHMMSS-DEVICE.ext` beside it. But AML treated that
copy as an ordinary file. A conflicted note appeared **twice** in the Browser, in Quick Open,
in search, in backlinks and in the graph, and nothing anywhere said which was which or that a
decision was waiting. Nobody would ever resolve it, and the duplicate would drift for ever.

## Design

### Finding copies (`src-tauri/src/conflicts.rs`)
A copy is recognised by its name alone — Syncthing's pattern, anchored, with the marker before
the last extension and an optional extension (`a.tar.gz` → `a.tar.sync-conflict-…-DEV.gz`). A
note that merely *talks about* conflicts does not match.

The whole Folio is walked **including `.aml/`**: `boundings.yaml`, `types.yaml` and
`config.yaml` are synced files that can conflict like any note. Every other hidden folder is
someone else's business. A copy is one of three kinds — a **note** (compared paragraph by
paragraph), a **settings** file (`.yaml`, one item per line), or any other **file** (an image,
a diagram — one side or the other, whole).

`is_ignored_name` now includes conflict copies, so they leave the Browser, the note count and
the index. The watcher deliberately lets them *through* (`watch::passes`), including inside
`.aml/`: a copy arriving is exactly the change the Conflicts screen is waiting for. The index
drops a copy it is told about, which also cleans any row an index built before this WP holds.

### Resolving: the whole text, atomically, and the Trash for what is given up
Four resolutions, each a single Rust call:

| Resolution | What happens |
|---|---|
| Keep in place | The copy goes to the Trash |
| Use the set-aside copy | The copy's bytes replace the original; the replaced original goes to the Trash |
| Save my choices | The combined text replaces the original; the replaced original and the copy both go to the Trash |
| Keep both | The copy is renamed `Note (copy from 2026-09-13).md` beside it, never over an existing file |

**Nothing is deleted.** With no Snapshots yet, the Trash is the only way back from a wrong
choice, so a resolution writes the replaced version to a temporary file under a name that says
what it was — `03 Influence (before resolving a conflict).md` — and sends *that* to the Trash.
The write itself is `write_atomic`, the same temp-and-rename every save uses, so Syncthing never
ships a half-written file.

**A resolution is refused if the original changed while you were deciding.** The screen sends
the original's mtime as it was read; if the file has moved since, the answer is the usual
`conflict` error and the screen re-reads both sides and says so. A decision made about text
that is no longer there is not applied to text you have not seen.

**Only a conflict copy can be resolved.** `locate` refuses any path whose last segment is not a
conflict name, any `..`, any absolute path. That is why this one module may write into `.aml/`
when nothing else may: it can only ever touch the two files a conflict is made of.

Keeping both is refused for a file inside `.aml/`: two Boundings files is not two sets of
Boundings, because only one is ever read.

### No common ancestor
A three-way merge needs the version both sides started from, and that is a Snapshot (WP-4.1),
which does not exist yet. So `features/conflicts/merge.ts` is a **two-way** comparison: it says
*where* the sides differ, never *who changed what*. It therefore never picks for you in a way
that could drop text:

- For a **note**, every difference starts on *In place* (the newer edit, what is already
  there), and nothing is written until you press a button.
- For a **settings** file, every difference starts on *Both*: one item per line means keeping
  both sides is almost always right, and the combination drops lines the two sides share rather
  than repeating them.

When WP-4.1 lands, `hunks` gains a base argument and the defaults can become "take whichever
side changed". The screen does not change shape.

### The comparison
Markdown keeps a paragraph on one line, so a **line diff is a paragraph diff** — the unit a
writer actually chooses between. It is a longest-common-subsequence diff with the shared head
and tail trimmed first, because a conflict is almost always a few paragraphs in a long note;
past four million cells the middle is shown as one change rather than computed. Inside a
changed paragraph the differing **words** are marked, because two versions of one sentence are
unreadable side by side otherwise.

Each difference shows both sides; click a side, or pick *In place / Set aside / Both*. *Take
every one from…* sets them all at once. Unchanged stretches collapse to the two paragraphs
either side of a difference. *Both* keeps the two versions as **separate paragraphs** — run
together on consecutive lines, markdown would quietly fuse them into one.

A combination that turns out to be exactly one side is sent as that side, so the Trash holds
what actually happened rather than a "merge" identical to the copy.

### Who wrote which
Syncthing names the copy after the device that wrote the *older* edit. When those seven
characters are this computer's own Device ID, the screen says *written on this computer*;
otherwise *written on another computer*. It does not guess a name: this computer pairs with the
NAS, not with the other laptop, so it has never been told what the other one is called.

### Unsaved edits over a changed file
The editor already refused to save over a note that changed on disk underneath it, with
*Discard mine* and *Keep mine*. That banner now has **Compare**, which opens the same screen
with *On disk* against *Your edits*. The decision is written straight over the note, guarded by
the mtime that was read, and the editor reloads what was written. It is the same decision — two
texts for one note — so it is the same screen.

### Where it shows
- **A chip in the status bar**, `2 conflicts`, outlined in the accent: not an invitation like
  the update chip, something that stays wrong until it is dealt with.
- **A banner on the note itself** when the open note has a copy set aside.
- **Resolve Conflicts…** in the Command Palette.
- The list refreshes when a Folio opens and when the watcher reports a copy arriving or leaving
  — never on every change event, because listing walks the Folio and every autosave is one.

**Dependencies:** none added. The diff is ours, and small; `regex` and `trash` were already
here.

## Acceptance criteria
- [x] Syncthing's names are read, including multi-dot and extensionless ones; a lookalike is not
      a copy (Rust, `conflicts.rs`).
- [x] Copies are found in folders and in `.aml/`, not in other hidden folders; one whose original
      was deleted is still listed.
- [x] A copy is not in the Browser, the note count or the index; the watcher still reports it
      (`watch.rs`).
- [x] Keep in place / use the copy / save a combination / keep both each do exactly that, and
      everything given up is handed to the discard step — never deleted.
- [x] A resolution is refused, and both files left untouched, when the original changed since it
      was read; only a conflict copy can be resolved, never `..` or an ordinary note.
- [x] Unit: a line diff finds one changed paragraph in a long note; composing either side returns
      it exactly; *Both* keeps two paragraphs, not one fused line; a settings union does not
      repeat shared lines; changed words are marked (`merge.test.ts`).
- [x] E2E: a set-aside copy raises a chip, the screen compares it, *Both* keeps both and clears the
      chip; *Keep in place* leaves the note byte-identical; a note with a copy shows a banner whose
      Compare opens it; Escape steps back before it closes (`e2e/conflicts.spec.ts`).
- [ ] **Gate 4:** edit the same note on both machines with one offline, reconnect — the conflict is
      in Conflicts within 10 s, the combination is right, nothing is lost (`docs/qa/stage-4.md`).
