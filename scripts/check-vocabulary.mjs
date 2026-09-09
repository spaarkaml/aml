// Fails CI if forbidden vocabulary appears in UI code or docs (ADR-011).
// The glossary and ADRs may mention the words when explaining why they are banned.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const FORBIDDEN = [/\bvaults?\b/i];
const ROOTS = ["src", "src-tauri/src", "e2e", "themes"];
const SKIP = new Set(["src/ipc/bindings.ts"]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

let failures = 0;
for (const root of ROOTS) {
  let files = [];
  try {
    files = walk(root);
  } catch {
    continue;
  }
  for (const file of files) {
    if (SKIP.has(file)) continue;
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      for (const re of FORBIDDEN) {
        if (re.test(line)) {
          failures += 1;
          process.stderr.write(`${file}:${i + 1}: forbidden vocabulary: ${line.trim()}\n`);
        }
      }
    });
  }
}
if (failures > 0) {
  process.stderr.write(
    `\n${failures} forbidden-vocabulary hit(s). See docs/03-GLOSSARY-AND-NAMING.md.\n`,
  );
  process.exit(1);
}
process.stdout.write("vocabulary ok\n");
