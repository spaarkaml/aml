# WP-8.2 — Auto-update (and the rest of WP-8.1)
**Stage:** 8 (pulled forward) · **Depends on:** 8.1 · **ADRs:** 001, 004, 012 · **Sessions:** 1

## Goal
AML notices a new release, says so quietly, and installs it when asked. Releasing one is a
single command. Neither machine has to be sent an installer again.

## Design

### One tag, two machines, no attachments
`node scripts/version.mjs 0.2.0` sets the version in the three files that must never disagree
(`package.json`, `Cargo.toml`, `tauri.conf.json` — plus `Cargo.lock`), and `pnpm version:check`
in `pnpm check` fails the build if they ever do. A drift there is not cosmetic: the bundle
takes its version from `tauri.conf.json`, `app_info` reports Cargo's, and the release workflow
compares the tag with `tauri.conf.json` — so a mismatch ships an installer whose own About box
lies about which release it is, and an updater that never sees itself as out of date.

Push the tag and `release.yml` builds both platforms, signs the update bundles, writes
`latest.json` and publishes the release. Every installed copy finds it within six hours.

### The endpoint is a file in the release
The updater asks one URL — `releases/latest/download/latest.json` — for a version, some notes
and one entry per platform: a download URL and a signature. `scripts/latest-json.mjs` builds
that file **from the `.sig` files the bundler produced**, never from a list typed by hand, and
*fails the release* if either platform is missing rather than publishing a release that
silently leaves one machine behind.

This is why the release is published rather than left as a draft, which is what WP-8.1 wrote:
a draft has no `releases/latest`, so every installed copy would go on reporting that it is
already the newest version.

### Signing, which is not code signing
ADR-012 buys no Apple or Authenticode certificate, and none is needed here. Tauri's updater
has its own minisign key, free and unrelated to the OS: the private half is a GitHub secret,
the public half is in `tauri.conf.json`, and a bundle that does not carry a signature made
with the private half is refused *before it is unpacked*. So the download does not have to be
trusted — which matters more for an app with no OS signature, not less.

The key lives at `~/.tauri/aml-updater.key` on the Mac and in the repository's secrets.
**Losing both ends updating for every installed copy**: they would have to be replaced by hand.

### Windows updates through NSIS, not the MSI
`-setup.exe` installs for the current user, so an update never asks for an administrator
password; the MSI is still published for a per-machine install but is not the update path, and
`latest-json.mjs` refuses to point at one. macOS updates replace `AML.app` from the
`.app.tar.gz` the bundler signs; it is ad-hoc signed like every other build, so the replaced
app launches without the "damaged" refusal that the 2026-09-12 fix removed.

### In the app: Rust asks, the webview is told
The updater is a Rust command like everything else that touches the network or the disk
(ADR-001). `update_check` asks the endpoint and keeps what it found; `update_install`
downloads it, verifies it and restarts into it, emitting throttled progress on the way. The
webview never fetches anything.

Errors are their own type rather than `FolioError` — nothing here is about a Folio, and "File
error: dns error" would be a lie — and the signature cases are separated from the network ones
on purpose: a refused signature and a failed download arrive as the same Rust type but mean
opposite things to the person reading the message.

### What it looks like
- **The version in the status bar** is now a button; it opens **Updates**.
- **A filled chip** appears beside it when a release is waiting: the only chip in that bar
  that is an invitation rather than a state.
- **The screen** shows the version on offer, its notes, one button — *Update and restart* —
  and *Not now*. "Not now" is about *that version*: a later one un-skips itself, because one
  dismissal must not quietly switch updating off for ever.
- **Checks are silent**: five seconds after launch (never competing with opening the Folio and
  the index), then every six hours, and a failure says nothing at all. An aeroplane is not an
  error message. A check the user asks for answers out loud, even when the answer is "nothing".
- Updating is **per device**, not a Folio setting: the automatic-check toggle is in this
  screen and not in Settings, which says "these follow the Folio to your other machines".

**Dependencies:** `tauri-plugin-updater` 2.11 — the updater itself; it is what verifies the
minisign signature and replaces the installed bundle on both platforms.

## Acceptance criteria
- [x] `pnpm version:check` fails on a version that disagrees between the three files; setting
      a version writes all three and `Cargo.lock` (round-tripped by hand).
- [x] `latest-json.mjs` builds the endpoint file from `.sig` files and exits non-zero when a
      platform is missing.
- [x] A local `pnpm tauri build` produces `AML.app.tar.gz` + `.sig`, and the bundle still
      passes `codesign --verify --deep --strict`.
- [x] Rust: a refused signature is never reported as a network problem; the same I/O failure
      reads differently before and after the download; progress is throttled but the last
      event always lands (`src-tauri/src/update.rs`).
- [x] Unit: version comparison orders 0.10 after 0.9 and a release ahead of its candidates;
      a dismissed version stays hidden and a later one does not (`features/update/update.test.ts`).
- [x] E2E: the status-bar version opens Updates; an offer shows its notes; a failed install
      says so instead of hanging; "Not now" hides that version and survives a reload, and a
      newer one comes back (`e2e/update.spec.ts`).
- [ ] **Gate 8:** an actual update from the previous release installs and relaunches on both
      machines (`docs/qa/stage-8.md` §1–§8).
