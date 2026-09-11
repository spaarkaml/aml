/**
 * Downloads the faces ADR-010 says AML bundles into public/fonts/, with their licences.
 * They are not committed (see .gitignore); CI and `pnpm tauri dev/build` run this first, the
 * same way the Syncthing sidecar is fetched.
 *
 *   node scripts/fetch-fonts.mjs
 *
 * Every face here is licensed under the SIL Open Font License 1.1, which allows bundling in
 * an application as long as the licence travels with it — hence the OFL.txt beside each one.
 */

/* biome-ignore-all lint/suspicious/noConsole: build script talks through stdout */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const RAW = "https://raw.githubusercontent.com/google/fonts/main";

/** Variable fonts, one file per family: the whole weight range for ~100–400 KB. */
export const FONTS = [
  {
    family: "Source Serif 4",
    file: "SourceSerif4.ttf",
    url: `${RAW}/ofl/sourceserif4/SourceSerif4%5Bopsz%2Cwght%5D.ttf`,
    licence: `${RAW}/ofl/sourceserif4/OFL.txt`,
  },
  {
    family: "Literata",
    file: "Literata.ttf",
    url: `${RAW}/ofl/literata/Literata%5Bopsz%2Cwght%5D.ttf`,
    licence: `${RAW}/ofl/literata/OFL.txt`,
  },
  {
    family: "EB Garamond",
    file: "EBGaramond.ttf",
    url: `${RAW}/ofl/ebgaramond/EBGaramond%5Bwght%5D.ttf`,
    licence: `${RAW}/ofl/ebgaramond/OFL.txt`,
  },
  {
    family: "IBM Plex Mono",
    file: "IBMPlexMono.ttf",
    url: `${RAW}/ofl/ibmplexmono/IBMPlexMono-Regular.ttf`,
    licence: `${RAW}/ofl/ibmplexmono/OFL.txt`,
  },
];

const DIR = join("public", "fonts");

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  mkdirSync(DIR, { recursive: true });
  for (const font of FONTS) {
    const target = join(DIR, font.file);
    if (existsSync(target)) {
      const size = readFileSync(target).length;
      console.log(`${font.family}: already here (${Math.round(size / 1024)} KB)`);
      continue;
    }
    const bytes = await get(font.url);
    writeFileSync(target, bytes);
    const licence = await get(font.licence);
    writeFileSync(join(DIR, `${font.file.replace(/\.ttf$/, "")}-OFL.txt`), licence);
    const sha = createHash("sha256").update(bytes).digest("hex").slice(0, 12);
    console.log(`${font.family}: ${Math.round(bytes.length / 1024)} KB (sha256 ${sha}…)`);
  }
  console.log(`fonts ready in ${DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
