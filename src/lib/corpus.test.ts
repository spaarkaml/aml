import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Guards the round-trip corpus itself (WP-0.6). The round-trip assertions arrive with the
 * markdown bridge in WP-1.2; until then this proves every listed file exists, every file is
 * listed, and expectations use the agreed vocabulary.
 */
const ROOT = join(process.cwd(), "test-corpus");
type Entry = { category: string; expect: "lossless" | "canonicalised" | "raw"; note: string };
const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8")) as {
  files: Record<string, Entry>;
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith(".md")) out.push(p.slice(ROOT.length + 1));
  }
  return out;
}

describe("test-corpus", () => {
  const listed = Object.keys(manifest.files);
  const onDisk = walk(ROOT).sort();

  it("lists at least 40 files across all categories", () => {
    expect(listed.length).toBeGreaterThanOrEqual(40);
    const cats = new Set(listed.map((f) => manifest.files[f]?.category));
    expect([...cats].sort()).toEqual(["blocks", "edge", "inline", "links", "meta", "raw"]);
  });

  it("every manifest entry exists and every file is in the manifest", () => {
    for (const f of listed) expect(existsSync(join(ROOT, f)), f).toBe(true);
    expect(listed.sort()).toEqual(onDisk);
  });

  it("uses only the agreed expectation vocabulary", () => {
    for (const [f, e] of Object.entries(manifest.files)) {
      expect(["lossless", "canonicalised", "raw"], f).toContain(e.expect);
      expect(e.note.length, f).toBeGreaterThan(5);
    }
  });
});
