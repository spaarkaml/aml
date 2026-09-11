/**
 * Downloads the pinned Syncthing release for the current (or given) Rust target triple into
 * src-tauri/binaries/, named the way Tauri's `externalBin` expects:
 *   src-tauri/binaries/syncthing-<target-triple>[.exe]
 * The binaries are not committed (see .gitignore); CI and `pnpm tauri dev/build` run this first.
 *
 *   node scripts/fetch-syncthing.mjs                 # host target
 *   node scripts/fetch-syncthing.mjs x86_64-pc-windows-msvc
 */

/* biome-ignore-all lint/suspicious/noConsole: build script talks through stdout */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const SYNCTHING_VERSION = "v2.1.5";

const ASSETS = {
  "aarch64-apple-darwin": {
    asset: "syncthing-macos-arm64",
    dir: "syncthing-macos-arm64",
    exe: "syncthing",
  },
  "x86_64-apple-darwin": {
    asset: "syncthing-macos-amd64",
    dir: "syncthing-macos-amd64",
    exe: "syncthing",
  },
  "x86_64-pc-windows-msvc": {
    asset: "syncthing-windows-amd64",
    dir: "syncthing-windows-amd64",
    exe: "syncthing.exe",
  },
};

function hostTriple() {
  const { platform, arch } = process;
  if (platform === "darwin")
    return arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin";
  if (platform === "win32") return "x86_64-pc-windows-msvc";
  throw new Error(`unsupported host ${platform}/${arch}`);
}

async function main() {
  const triple = process.argv[2] ?? hostTriple();
  const spec = ASSETS[triple];
  if (!spec) throw new Error(`no Syncthing asset mapped for ${triple}`);
  const outDir = join(process.cwd(), "src-tauri", "binaries");
  const ext = triple.includes("windows") ? ".exe" : "";
  const out = join(outDir, `syncthing-${triple}${ext}`);
  const stamp = `${out}.version`;
  if (
    existsSync(out) &&
    existsSync(stamp) &&
    readFileSync(stamp, "utf8").trim() === SYNCTHING_VERSION
  ) {
    console.log(`syncthing ${SYNCTHING_VERSION} for ${triple} already present`);
    return;
  }
  mkdirSync(outDir, { recursive: true });
  const name = `${spec.asset}-${SYNCTHING_VERSION}.zip`;
  const url = `https://github.com/syncthing/syncthing/releases/download/${SYNCTHING_VERSION}/${name}`;
  console.log(`downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const sumsRes = await fetch(
    `https://github.com/syncthing/syncthing/releases/download/${SYNCTHING_VERSION}/sha256sum.txt.asc`,
  );
  if (sumsRes.ok) {
    const sums = await sumsRes.text();
    const line = sums.split("\n").find((l) => l.endsWith(name));
    const actual = createHash("sha256").update(buf).digest("hex");
    if (line && !line.startsWith(actual)) throw new Error(`sha256 mismatch for ${name}`);
    if (line) console.log("sha256 verified");
  }
  const work = join(tmpdir(), `aml-syncthing-${Date.now()}`);
  mkdirSync(work, { recursive: true });
  const zip = join(work, name);
  writeFileSync(zip, buf);
  if (process.platform === "win32") {
    execFileSync("powershell", [
      "-NoProfile",
      "-Command",
      `Expand-Archive -Path '${zip}' -DestinationPath '${work}' -Force`,
    ]);
  } else {
    execFileSync("unzip", ["-q", "-o", zip, "-d", work]);
  }
  const extracted = join(work, `${spec.dir}-${SYNCTHING_VERSION}`, spec.exe);
  if (!existsSync(extracted)) throw new Error(`expected ${extracted} after extraction`);
  copyFileSync(extracted, out); // copy, not rename: temp and repo may be on different drives (CI)
  writeFileSync(stamp, `${SYNCTHING_VERSION}\n`);
  rmSync(work, { recursive: true, force: true });
  console.log(`wrote ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
