# WP-4.1 — Snapshots (with WP-3.5's History UI)
**Stage:** 4 (and 3) · **Depends on:** 1.1, 4.2 · **ADRs:** 004, 005, 006, 011, 013 · **Sessions:** 1

**Built 2026-09-14, after WP-4.2 by decision.** The plan called 4.1 "hardening"; there was no
engine to harden, so this WP builds the engine *and* WP-3.5's History screen. Bryce's brief:
*intuitive and subtle — I don't plan on needing this often.* So nothing about it asks for
attention while writing, and it is there the moment something has gone wrong.

## Goal
Every note has a history you never have to think about: a full copy from before you started
changing it, another every half hour while you write, and any you label yourself. You can see
what changed since any of them and put one back exactly.

## Design

### Where Snapshots live (ADR-006, unchanged)
`.aml/snapshots/<note path>/<YYYYMMDD-HHMMSS>[-label].md` — a full copy, byte for byte. The
tree mirrors the notes, so it is legible in Finder and on the NAS without AML.

- **UTC stamps.** The two machines agree about order and about which day a Snapshot belongs to
  whatever time zone either is in; the screen shows local time.
- **Written once, named to the second.** A Snapshot file is never edited, and two machines never
  write the same name, so Snapshots cannot themselves conflict. A second Snapshot in the same
  second takes the next free second (the same bytes reuse the existing one).
- **Synced.** `.aml/` follows the Folio (ADR-005), so a restore on one machine arrives on the
  other as an ordinary note change, and the history is on both.
- Hidden from the watcher, the index and the Browser as all of `.aml/` is. The Conflicts walk
  skips `.aml/snapshots/` explicitly: there can be thousands of files there and none can conflict.

### When one is taken — not by a timer
ADR-006 says "every 30 minutes while the note has changed since its last snapshot". A timer
thread scanning the Folio would snapshot the other machine's synced edits on both machines, and
would keep a copy of the text *after* the half hour rather than the one you might want back. So
the rule runs where a note is about to change:

> **Before a note is written**, if this run of AML has not looked at that note in the last 30
> minutes, the text **on disk** — the version about to be replaced — is kept, unless it is
> exactly the newest Snapshot already.

So the first save of a sitting keeps the note as it was before you touched it; a long sitting
keeps one every half hour; a note nobody changes gets none; and a machine that only *received*
an edit never duplicates the Snapshot the other one took (it is byte-identical to the newest).
The last state of a sitting needs no Snapshot — it is the note itself — and it becomes one the
next time anyone changes the note.

The "sitting" is an in-memory map of note path → last look, so a restart is a new sitting. It
runs inside `Folio::write_note`, which is every autosave, the Corkboard's synopsis/label/status
writes and templates; and before the line rewrites of a rename's link updates and *Link this
mention* (ADR-006's "rename-with-link-update"). A Snapshot that fails to write is logged and
**never stops the save it was protecting**.

Labelled Snapshots are kept automatically before the two moments AML itself replaces a note's
whole text: **Before restoring** and **Before resolving a conflict** (a Conflicts *Use the copy*
or *Save my choices* over a note — alongside the Trash copy WP-4.2 already makes). Return-merge
does not exist (WP-4.6 is optional and unbuilt).

### Retention
Runs on a background thread each time a Folio opens:
- **everything** for 7 days;
- then **the newest of each day** until 90 days;
- then **only labelled** ones —
- and **always a note's newest**, so a note untouched for a season still has one.

*The last point is a clarification of ADR-006, not a change:* it only ever keeps more than the
ADR's rule, and without it a note left alone for three months would lose its whole history.

Both numbers are Folio settings (`snapshots.keepAllDays`, `snapshots.keepDailyDays` in
`.aml/config.yaml`, one per line), editable in Settings. Floors: at least one day of everything,
and the daily stretch never ends before the keep-everything one. Days are UTC days, so both
machines prune the same files from the same names. Pruned files are removed, not sent to the
Trash — they are AML's own copies, there can be hundreds, and Syncthing's versioning on the NAS
is the backstop underneath (ADR-006).

### History, the screen
Deliberately quiet. **Three ways in, none of them new chrome:**
- **Click *Saved* in the status bar.** Where you look to see that your work is safe is where you
  would look for an older version of it (Google Docs' pattern).
- **Right-click in the note → Note History…**
- The palette: **Note History…** and **Take Snapshot…**. No default shortcut: it is rarely used,
  and a shortcut would be one more thing to collide with.

The screen is a sheet like Conflicts:
- **Left:** the timeline, grouped *Today / Yesterday / Fri 11 Sept*, each a time, a label if it
  has one, and a word count to tell versions apart. **Take snapshot** at the top opens an inline
  label field (optional) — no dialog on a dialog. ↑/↓ move through the list.
- **Right:** *N changes from this snapshot to* **[the note now ▾]** — or to any other Snapshot,
  which is ADR-006's "diff between any two". **Changes** shows the differing paragraphs, what the
  Snapshot said above what it says now, with the changed words marked and unchanged stretches
  collapsed; **Whole snapshot** shows the Snapshot as it was, with the paragraphs that have since
  changed tinted. Both reuse WP-4.2's `merge.ts` diff.
- **Restore this snapshot**, with the reassurance beside it: *Restoring keeps the note as it is
  now as a snapshot first.* No confirmation dialog, because the restore is itself undoable from
  the same list. Disabled when the Snapshot is the note as it is.

**Everything acts on the note on disk.** Opening History, taking a Snapshot and restoring each
save the editor first; if the editor is holding edits over a changed file (WP-4.2's banner), the
screen says so and restores nothing. After a restore the editor reloads what was written.

**Restore is byte-identical**: `write_atomic` of the Snapshot's exact bytes, not a re-serialised
document — Gate 3's line.

### Moving with the note
`Folio::rename` moves `.aml/snapshots/<from>` to `<to>`, for a note or a folder, merging into an
existing history rather than overwriting it. A trashed note's history stays where it is and is
pruned like any other.

### Settings
*Snapshots* section: **Keep all [7] days, then one a day until [90] days old**, and a sentence
saying when they are taken and how many this Folio holds and how much room they take (ADR-006's
"shown in Settings").

**Dependencies:** none added.

## Commands
| Command | Args | Returns |
|---|---|---|
| `snapshots_list` | path | `Snapshot[] { id, taken, label?, words, size }`, newest first |
| `snapshot_read` | path, id | text |
| `snapshot_take` | path, label? | `Snapshot` |
| `snapshot_restore` | path, id | `NoteMeta` (keeps *Before restoring* first) |
| `snapshots_usage` | — | `{ count, bytes }` |

`Preferences` gains `snapshotKeepAllDays` and `snapshotKeepDailyDays`.

## Acceptance criteria
- [x] Names round-trip in UTC, with and without a label; lookalikes are refused; a label is made
      safe for both file systems (Rust).
- [x] The first write of a sitting keeps the text on disk; nothing more for 30 minutes; then the
      text on disk again; a new sitting over text that is already the newest Snapshot keeps
      nothing; new, empty and `.aml/` files get none; `..` is refused (Rust).
- [x] `write_note` takes the automatic Snapshot (Rust).
- [x] Restore is byte-identical (CRLF, NBSP and front matter included), keeps *Before restoring*,
      and restoring what is already there does nothing (Rust).
- [x] Retention: a week of everything, one a day to 90 days, labels, and the newest always; on
      disk it removes files and empty folders and counts what is left (Rust).
- [x] History follows a renamed note and a renamed folder, and merges into an existing history
      (Rust). Resolving a conflict over a note keeps *Before resolving a conflict* (Rust).
- [x] Retention settings are read with their floors and written one per line (Rust); the Settings
      store reads and sends them (Vitest).
- [x] Timeline headings, times, grouping and sizes (Vitest).
- [x] E2E: an edit keeps the note as it was; *Saved* opens History showing the change; restore puts
      the exact bytes back and leaves *Before restoring*; *Take Snapshot…* keeps a labelled one;
      right-click opens History; Settings counts it (`e2e/history.spec.ts`).
- [ ] **Gate 3:** Snapshot → edit → compare → restore on the real Folio; the restored file is
      byte-identical (`docs/qa/stage-4.md` §15–§17).
- [ ] **Gate 4:** restore a Snapshot from a week ago on the Mac; the PC receives the restored note
      (`docs/qa/stage-4.md` §18).
