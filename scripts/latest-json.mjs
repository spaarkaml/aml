// Writes the `latest.json` the in-app updater reads (WP-8.2).
//
// The updater asks one URL what the newest release is and gets back a version, some notes and
// one entry per platform: a download URL and the minisign signature the bundler produced next
// to it. The signature is the whole security model — AML refuses a bundle that does not carry
// one made with its private key — so this file is built from the `.sig` files that came out
// of the build, never from a list typed by hand.
//
//   node scripts/latest-json.mjs <dir-of-installers> <version> <notes-file> > latest.json
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const REPO = "spaarkaml/aml";

/** Which platform key an updater artifact belongs to, by how the bundler named it. */
function platformOf(name) {
  // We build exactly two targets: Apple silicon and Windows x64 (see release.yml).
  if (name.endsWith(".app.tar.gz")) return "darwin-aarch64";
  if (name.endsWith("-setup.exe")) return "windows-x86_64";
  // The MSI is published for a first install but is not the update path: NSIS installs for
  // the current user, so an update never asks for an administrator password.
  return null;
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const [dir, version, notesFile] = process.argv.slice(2);
if (!dir || !version) {
  console.error("usage: node scripts/latest-json.mjs <dir> <version> [notes-file]");
  process.exit(1);
}

const platforms = {};
for (const sig of walk(dir).filter((f) => f.endsWith(".sig"))) {
  const bundle = sig.slice(0, -".sig".length);
  const name = bundle.split("/").pop();
  const platform = platformOf(name);
  if (!platform) continue;
  platforms[platform] = {
    signature: readFileSync(sig, "utf8").trim(),
    url: `https://github.com/${REPO}/releases/download/v${version}/${encodeURIComponent(name)}`,
  };
}

const missing = ["darwin-aarch64", "windows-x86_64"].filter((p) => !platforms[p]);
if (missing.length > 0) {
  // A release that silently drops a platform would leave that machine on the old version
  // with no way to know why, so this is an error rather than a warning.
  console.error(`no signed updater bundle for: ${missing.join(", ")}`);
  console.error(`found: ${Object.keys(platforms).join(", ") || "nothing"}`);
  process.exit(1);
}

process.stdout.write(
  `${JSON.stringify(
    {
      version,
      notes: notesFile ? readFileSync(notesFile, "utf8").trim() : "",
      pub_date: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
      platforms,
    },
    null,
    2,
  )}\n`,
);
