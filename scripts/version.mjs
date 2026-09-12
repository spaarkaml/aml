// The app's version lives in three files that must never disagree: package.json,
// src-tauri/Cargo.toml and src-tauri/tauri.conf.json. The bundle takes its version from the
// last one, `app_info` reports the second, and the release tag is checked against
// tauri.conf.json — so a drift between them ships an installer whose own About box lies about
// which release it is, and an updater that never sees itself as out of date.
//
//   node scripts/version.mjs 0.2.0    set all three (and Cargo.lock)
//   node scripts/version.mjs --check  assert they agree (runs in `pnpm check`)
import { readFileSync, writeFileSync } from "node:fs";

const PKG = "package.json";
const CARGO = "src-tauri/Cargo.toml";
const CONF = "src-tauri/tauri.conf.json";
const LOCK = "src-tauri/Cargo.lock";

const read = (p) => readFileSync(p, "utf8");

/** The `[package]` block of Cargo.toml — everything up to the next `[section]`. */
function packageBlock(text) {
  const start = text.indexOf("[package]");
  if (start === -1) return null;
  const rest = text.slice(start + "[package]".length);
  const end = rest.search(/^\[/m);
  return { start, body: end === -1 ? rest : rest.slice(0, end) };
}

function cargoVersion(text) {
  return packageBlock(text)?.body.match(/^version\s*=\s*"([^"]+)"/m)?.[1] ?? null;
}

function versions() {
  return {
    [PKG]: JSON.parse(read(PKG)).version,
    [CARGO]: cargoVersion(read(CARGO)),
    [CONF]: JSON.parse(read(CONF)).version,
  };
}

function check() {
  const found = versions();
  const unique = [...new Set(Object.values(found))];
  if (unique.length === 1 && unique[0]) {
    console.log(`version ${unique[0]}`);
    return 0;
  }
  console.error("the app version disagrees between files:");
  for (const [file, v] of Object.entries(found)) console.error(`  ${file}: ${v}`);
  console.error("run: node scripts/version.mjs <version>");
  return 1;
}

function set(next) {
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(next)) {
    console.error(`not a version: ${next} (expected 1.2.3, optionally with -rc.1)`);
    return 1;
  }
  const pkg = JSON.parse(read(PKG));
  pkg.version = next;
  writeFileSync(PKG, `${JSON.stringify(pkg, null, 2)}\n`);

  const cargo = read(CARGO);
  const block = packageBlock(cargo);
  if (!block) {
    console.error(`no [package] block in ${CARGO}`);
    return 1;
  }
  const body = block.body.replace(/^version\s*=\s*"[^"]+"/m, `version = "${next}"`);
  writeFileSync(
    CARGO,
    cargo.slice(0, block.start + "[package]".length) +
      body +
      cargo.slice(block.start + "[package]".length + block.body.length),
  );

  const conf = JSON.parse(read(CONF));
  conf.version = next;
  writeFileSync(CONF, `${JSON.stringify(conf, null, 2)}\n`);

  // Keeps Cargo.lock in step, so the next build is not also a lockfile diff. Cargo would
  // rewrite this line itself on the next build; doing it here keeps the bump one commit.
  const lock = read(LOCK);
  writeFileSync(
    LOCK,
    lock.replace(/(\[\[package\]\]\nname = "aml"\nversion = )"[^"]+"/, `$1"${next}"`),
  );
  console.log(`version set to ${next} in ${[PKG, CARGO, CONF].join(", ")}`);
  return check();
}

const arg = process.argv[2];
process.exit(!arg || arg === "--check" ? check() : set(arg));
