# Releasing AML

One command's worth of work. Everything else is CI.

```bash
node scripts/version.mjs 0.2.0
pnpm check && pnpm e2e
git commit -am "Release 0.2.0" && git push
git tag v0.2.0 && git push origin v0.2.0
```

`release.yml` then builds both platforms, signs the update bundles, writes `latest.json` and
publishes the release. Installed copies of AML find it within six hours, or immediately from
**Updates** (click the version in the status bar).

## The checklist

1. **CHANGELOG.md** — move `## Unreleased` entries under `## 0.2.0 — YYYY-MM-DD`. The release
   notes on GitHub are generated from commit subjects; the changelog is the considered version.
2. **Version** — `node scripts/version.mjs 0.2.0`. It writes `package.json`,
   `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` and `Cargo.lock`. `pnpm check` fails if
   they ever disagree.
3. **Green** — `pnpm check` and `pnpm e2e` locally, and CI green on `main` before tagging.
4. **Tag** — `v` + the same version. The workflow refuses a tag that disagrees with
   `tauri.conf.json`.
5. **Watch the run** — `gh run watch`. The release fails rather than publishes if either
   platform's signed update bundle is missing.
6. **Check the endpoint** answers:
   `curl -sL https://github.com/spaarkaml/aml/releases/latest/download/latest.json`
   It must name the version you tagged and both `darwin-aarch64` and `windows-x86_64`.
7. **Update one machine from the app** before telling the other one to. Gate 8's second line
   is exactly this.

## What the release page carries

| File | For |
|---|---|
| `AML_<v>_aarch64.dmg` | first install on the Mac |
| `AML_<v>_x64-setup.exe` | first install on Windows — and the file updates come from |
| `AML_<v>_x64_en-US.msi` | a per-machine Windows install; **cannot update itself** |
| `AML.app.tar.gz` | what a Mac update downloads |
| `*.sig` | the minisign signatures; the updater refuses a bundle without one |
| `latest.json` | what a running AML reads to learn there is a newer version |

## The signing key

Update bundles are signed with AML's own minisign key (ADR-012 — this is not an OS
certificate and costs nothing). The public half is in `tauri.conf.json`; the private half is:

- `~/.tauri/aml-updater.key` and `~/.tauri/aml-updater.key.password` on the Mac, and
- the repository secrets `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

**Back both up somewhere that is not this Mac.** If the key and its password are lost, no
installed copy of AML can ever be updated again — every machine would have to be reinstalled
by hand from a release built with a new key.

## When it goes wrong

- **"the app version disagrees between files"** — `node scripts/version.mjs <version>`.
- **"read installers/nsis: is a directory"** — the downloaded artifacts keep the bundler's
  folders, and `gh release create` takes files. Fixed in the workflow on 2026-09-12; if a
  release ever fails at the upload step, nothing is published (gh rolls the release back) —
  delete the tag, fix, and tag again.
- **"no signed updater bundle for: …"** — the bundler did not sign that platform. Almost
  always a missing secret in the workflow's env, or `createUpdaterArtifacts` gone from
  `tauri.conf.json`.
- **The app says it is up to date when it is not** — the release is a draft or a pre-release,
  so `releases/latest` does not point at it. Publish it.
- **"the download was not signed by AML"** — the release was built with a different private
  key from the `pubkey` in the installed copy. That copy has to be reinstalled from the
  release page; there is no way around this, and that is the point of the check.
