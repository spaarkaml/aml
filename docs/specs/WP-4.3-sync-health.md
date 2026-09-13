# WP-4.3 — Sync status and health
**Stage:** 4 · **Depends on:** 1.1b · **ADRs:** 004, 005 · **Sessions:** 1 (with WP-4.2)

## Goal
The status bar already told the waits apart (WP-1.1b): starting, finding the NAS, offline,
syncing, up to date. What it could not tell you was the one failure that matters — **a sync
that looks like it is working and never finishes** — or how long the NAS has actually been
gone.

## Design

### What Syncthing is now asked
`SyncStatus` gains, from Syncthing's REST API, all through `sidecar::syncthing`:

- per device: **`lastSeen`** (`/rest/stats/device`; the Unix epoch Syncthing reports for "never"
  is dropped) and **`paused`**;
- per folder: **`paused`**, **`needItems`** (files still needed, from `/rest/db/completion`) and
  **`failures`** — the first 20 `{ path, error }` from `/rest/folder/errors`, asked only when
  `pullErrors` is non-zero.

`failures` is the diagnosis the stuck-at-95 % bug on 2026-09-12 needed and did not have: four
directories Syncthing could not delete, with the reason, instead of a percentage that never moves.

### The status bar
Two new words and one longer one, in the order they are checked:
- **Sync paused** — the folder or every NAS it is shared with is paused. Not "offline".
- **NAS offline · seen 3 h ago** — how long it has been is what tells a trip from a fault.
- **Sync stuck · 4 files** — Syncthing reported files it could not update.

### The banner: only for the silent failures
A floating card under the top bar, raised for exactly two situations while the NAS is
**connected**:

1. **Files that failed** — named, first three shown, with the reason.
2. **A sync that has stopped moving** — the folder unfinished and at the same completion for
   **10 minutes** (`STALLED_AFTER_MS`). Syncthing retries a failed file every minute or so;
   ten minutes of no movement with the NAS right there is not slow, it is stuck.

It offers **NAS sync**, **Open Syncthing** and **Dismiss**. Dismissing hides that particular
trouble; different trouble (another file, a new stall) raises it again.

**Being offline never raises it.** The plan asked for an "out-of-sync banner after N minutes".
Taken as *offline for N minutes*, that fires on every train journey: ADR-005 says travelling
needs no special mode, and a banner every trip is a nag you learn to ignore — which is the
opposite of what a warning is for. Offline is already visible in the status bar, now with how
long. The banner is kept for the case nothing else shows.

Stalls are tracked per folder in the sync store (`trackProgress`), from the polls it already
makes every 5 s; a folder that finishes, moves, pauses or loses its NAS starts the clock again.

### Syncthing's own view
**Open Syncthing's own view** on the NAS sync screen (and **Open Syncthing** on the banner)
opens the sidecar's web UI in the default browser, for the rare deep dive. The URL is opened
by `Syncthing::open_gui` with the OS's own opener — `open`, `rundll32 url.dll`, `xdg-open` —
rather than a new Tauri plugin; it is one URL and needs nothing more.

The NAS row says when it was last seen, and a folder row lists its failures and how many items
are left.

**Dependencies:** none added.

## Acceptance criteria
- [x] Offline says how long ago the NAS was seen; a paused folder or NAS says paused.
- [x] Failed files make the status bar say *stuck* and raise the banner.
- [x] A connected, unfinished sync is called stuck only after 10 minutes at the same completion;
      any movement resets it (`sync/store.test.ts`).
- [x] Being offline never raises the banner and never counts as stalled.
- [ ] **Gate 4:** the status bar reflects the NAS unplugged within 60 s and recovers when it is
      back; a folder Syncthing cannot finish is named (`docs/qa/stage-4.md`).
