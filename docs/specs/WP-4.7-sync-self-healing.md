# WP-4.7 — Sync that repairs itself
**Stage:** 4 · **Depends on:** 1.1b, 4.3 · **ADRs:** 005 · **Sessions:** 1

## Why
The NAS pairing stopped working and could not be fixed from inside AML. The diagnosis, from
the live sidecar:

- The Folio folder listed exactly one device — this Mac. **No peer could see it.**
- Syncthing's device statistics showed one connection that day, held for **19.7 seconds**.
  Two devices that pair, compare folder lists, find nothing in common and hang up.
- AML's sync sheet called the Folio synced and offered nothing, because it decided "synced"
  by matching the folder's *path*. The one button that would have repaired it was hidden
  precisely when it was needed.

The share had gone missing because **"Forget" removes the device from every folder it was in**
and re-adding it does not put it back — and nothing in AML ever looked again. A configuration
written once at pairing time and never checked is a configuration that drifts.

## What this changes

### 1 · AML remembers what it shared, and puts it back
`aml-shares.json` beside Syncthing's config (never in the Folio — ADR-004) records folder id →
device ids: AML's record of *intent*, as distinct from Syncthing's record of *state*.

`Syncthing::reconcile` compares the two and repairs the difference. It runs when the engine
starts and at most every 30 seconds from the status poll, which is what makes the repair
automatic rather than something to remember.

It is deliberately narrow:
- **Only adds.** Nothing here removes a device from a folder or a folder from the config.
- **Only what AML recorded.** A share it never made is not its business.
- **Only devices that still exist.** `remove_device` forgets that device's shares in the same
  call, so a NAS you deliberately forget stays forgotten.
- **A folder that is gone stays gone.** Re-creating one from a remembered share would be
  putting words in the user's mouth.
- **It adopts what it finds.** An install from before this work package has no record, so the
  first run takes the live config as the intent — otherwise the repair would only ever protect
  shares made after the update.

### 2 · `set_folder` merges rather than replaces
The config API's PUT writes the whole folder object, so sharing a folder with a second device
used to drop the first. The existing device list is now read back and merged, and the share is
recorded at the same time.

### 3 · The sheet says what is actually wrong
`isShared` separates "a folder exists at this path" from "a folder a peer can see". An
unshared Folio now reads *shared with nothing — no other computer can see it* and the
**Share this Folio with the NAS** button is there to fix it. The status bar says **Not shared**
rather than "No NAS paired", which was wrong twice over.

`describeDevice` names the three waits that used to read identically as "not connected yet":

| What is true | What it says |
|---|---|
| Connected, nothing shared with it | connected, but no folder is shared with it — nothing to sync |
| Paired before, nothing shared with it | paired, but no folder is shared with it — nothing to sync, so it hangs up |
| Shared, but never seen | not connected yet — waiting for the NAS to accept this computer |
| Shared, connects and drops | connects and drops after 20s · last seen … |

The middle rows need `lastConnectionDurationS`, which `fill_status` used to throw away; it is
now `SyncDevice.lastConnectionSeconds`.

### 4 · The engine is watched
If sync is enabled and the API stops answering, `sync_status` starts it again from a background
thread — `start` waits up to 20 s for Syncthing and the status bar must not stop while it does.
Attempts back off 5 s, 15 s, 60 s, then five minutes, and a success still waits five seconds, so
an engine that dies on start cannot spin. Before this, a sidecar that stopped stayed stopped
until somebody noticed the words "Sync stopped".

**Dependencies:** none added.

## Acceptance criteria
- [x] A folder stripped of its devices is repaired by the next reconcile, against the real
      Syncthing binary (`cargo test sidecar_starts -- --ignored`).
- [x] Forgetting a device forgets its shares, so reconcile does not pair it again (same test).
- [x] Sharing a folder keeps the devices it already had (`device_ids_of` merge, unit test).
- [x] The watchdog backs off and resets (unit test); a disabled engine is never restarted.
- [x] Forget → re-add leaves the Folio unshared, the sheet says so, and the Share button is
      on screen and repairs it (`e2e/sync.spec.ts`).
- [x] Each distinct wait gets its own words (`store.test.ts`).
- [ ] **Gate 4:** the two checks in `docs/qa/stage-4.md` §21–§22.

## Not in this work package
- **Repairing the NAS end.** AML can only see and set its own side; a folder the NAS has not
  accepted still has to be accepted there. The sheet now says so in as many words.
- **Fixing an address automatically.** A static address that points at the wrong port is a
  thing to tell the user about, not to guess at — the risk of silently dialling something
  else is worse than the fault.
- **Removing shares.** Reconcile only ever adds. A tool that both adds and removes from a
  remembered list will eventually remove something you wanted.
