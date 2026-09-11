import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULTS } from "@/features/appearance/tokens";

/**
 * ADR-013 put the whole visual foundation in `tokens.css`. These tests are what stops it
 * leaking back out into the components — every one of them was a real habit in the code
 * before the refresh, and each would be invisible until someone changed a token and found
 * that half the app ignored it.
 */

const tokensCss = readFileSync("src/app/tokens.css", "utf8");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(path));
    else if (entry.name.endsWith(".module.css")) out.push(path);
  }
  return out;
}

function blockOf(selector: string): Record<string, string> {
  const start = tokensCss.indexOf(`${selector} {`);
  expect(start, `selector ${selector}`).toBeGreaterThan(-1);
  const body = tokensCss.slice(start, tokensCss.indexOf("\n}", start));
  const out: Record<string, string> = {};
  for (const match of body.matchAll(/--aml-([a-z0-9-]+):\s*(#[0-9a-f]{6});/g)) {
    const [, name, value] = match;
    if (name && value) out[name] = value;
  }
  return out;
}

describe("the Appearance defaults and the stylesheet", () => {
  it("agree on every colour, so Reset restores what the app actually falls back to", () => {
    expect(blockOf(":root")).toMatchObject(DEFAULTS.paper);
    expect(blockOf(':root[data-mode="ink"]')).toMatchObject(DEFAULTS.ink);
  });
});

describe("the stylesheets", () => {
  // Read from disk rather than through Vite: a `.module.css` imported into a test arrives as
  // the class-name map, not as the text we want to inspect.
  const sheets = walk("src").map((path) => [path, readFileSync(path, "utf8")] as const);

  it("were all found", () => {
    expect(sheets.length).toBeGreaterThan(20);
  });

  it("name no colour of their own", () => {
    const offenders: string[] = [];
    for (const [path, css] of sheets) {
      // Hex colours and rgb()/hsl() literals both mean a value that Appearance cannot reach.
      for (const [hit] of css.matchAll(/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/g)) {
        offenders.push(`${path}: ${hit}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("use the radius scale rather than a px of their own", () => {
    const offenders: string[] = [];
    for (const [path, css] of sheets) {
      for (const [hit] of css.matchAll(/border-radius:\s*\d+px/g))
        offenders.push(`${path}: ${hit}`);
    }
    expect(offenders).toEqual([]);
  });

  it("use the type ramp rather than a px of their own", () => {
    const offenders: string[] = [];
    for (const [path, css] of sheets) {
      for (const [hit] of css.matchAll(/font-size:\s*\d+px/g)) offenders.push(`${path}: ${hit}`);
    }
    expect(offenders).toEqual([]);
  });
});
