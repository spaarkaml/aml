import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalise, docToMarkdown, markdownToDoc, normaliseSource } from "./index";
import { parseMarkdown } from "./mdast";
import type { PmNode } from "./types";

const ROOT = join(process.cwd(), "test-corpus");
type Entry = { category: string; expect: "lossless" | "canonicalised" | "raw"; note: string };
const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8")) as {
  files: Record<string, Entry>;
};

function stripPositions(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(stripPositions);
  if (x && typeof x === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
      if (k === "position") continue;
      out[k] = stripPositions(v);
    }
    return out;
  }
  return x;
}

function countRaw(n: PmNode): number {
  const self = n.type === "rawBlock" || n.type === "rawInline" ? 1 : 0;
  return self + (n.content ?? []).reduce((acc, c) => acc + countRaw(c), 0);
}

describe("markdown round-trip corpus", () => {
  const entries = Object.entries(manifest.files);

  it.each(entries)(
    "%s: canonical form is idempotent and the PM bridge preserves it",
    (file, entry) => {
      const source = readFileSync(join(ROOT, file), "utf8");
      const canonical = canonicalise(source);
      // 1. Idempotent: serialising the canonical form again changes nothing.
      expect(canonicalise(canonical), `${file} not idempotent`).toBe(canonical);
      // 2. Bridge: markdown → PM → markdown equals the canonical form (so the editor is lossless
      //    relative to what remark can represent), and the ASTs agree.
      const doc = markdownToDoc(source);
      const back = docToMarkdown(doc);
      expect(back, `${file} bridge drift`).toBe(canonical);
      expect(stripPositions(parseMarkdown(back))).toEqual(stripPositions(parseMarkdown(canonical)));
      // 3. Expectation from the manifest.
      if (entry.expect === "lossless") {
        expect(canonical, `${file} expected lossless`).toBe(normaliseSource(source));
      }
      if (entry.expect === "raw") {
        expect(countRaw(doc), `${file} expected Raw nodes`).toBeGreaterThan(0);
      }
    },
  );
});

describe("markdown bridge specifics", () => {
  it("front matter becomes a frontMatter node and comes back first", () => {
    const doc = markdownToDoc("---\ntitle: x\n---\n\n# H\n");
    expect(doc.content[0]?.type).toBe("frontMatter");
    expect(docToMarkdown(doc)).toBe("---\ntitle: x\n---\n\n# H\n");
  });

  it("wiki links, tags and citations are atoms that serialise verbatim", () => {
    const src =
      "See [[Other Note|alias]] and ![[pic.png|300]] with #parent/child and [@rid2020, p. 41].\n";
    const doc = markdownToDoc(src);
    const types = (doc.content[0]?.content ?? []).map((n) => n.type);
    expect(types).toEqual([
      "text",
      "wikiLink",
      "text",
      "wikiEmbed",
      "text",
      "tag",
      "text",
      "cite",
      "text",
    ]);
    expect(docToMarkdown(doc)).toBe(src);
  });

  it("unknown content is held as Raw and emitted verbatim", () => {
    const src = '<div align="center">x</div>\n\nTerm\n: Definition\n';
    const doc = markdownToDoc(src);
    expect(doc.content.map((n) => n.type)).toEqual(["rawBlock", "paragraph"]);
    expect(docToMarkdown(doc)).toBe(src);
  });

  it("a callout is a node with a real title, and comes back byte-identical (WP-3.9)", () => {
    const src = "> [!warning]- **Read** this\n> Body with a [[link]].\n>\n> Second paragraph.\n";
    const doc = markdownToDoc(src);
    const callout = doc.content[0];
    expect(callout?.type).toBe("callout");
    expect(callout?.attrs).toEqual({ kind: "warning", fold: "-" });
    // Title first, then the body blocks; the title is inline content, so its emphasis lives.
    expect(callout?.content?.map((n) => n.type)).toEqual([
      "calloutTitle",
      "paragraph",
      "paragraph",
    ]);
    expect(callout?.content?.[0]?.content?.[0]?.marks?.[0]?.type).toBe("bold");
    // The body is markdown in its own right: a wiki link inside one is still a wiki link.
    expect(callout?.content?.[1]?.content?.some((n) => n.type === "wikiLink")).toBe(true);
    expect(docToMarkdown(doc)).toBe(src);
  });

  it("a callout with no title, and one nested inside another, both survive", () => {
    const plain = markdownToDoc("> [!note]\n> Just a body.\n");
    expect(plain.content[0]?.content?.[0]).toEqual({ type: "calloutTitle", content: [] });
    expect(docToMarkdown(plain)).toBe("> [!note]\n> Just a body.\n");

    const src = "> [!note] Outer\n> > [!tip] Inner\n> > Nested body.\n";
    const nested = markdownToDoc(src);
    expect(nested.content[0]?.content?.[1]?.type).toBe("callout");
    expect(docToMarkdown(nested)).toBe(src);
  });

  it("an Obsidian layout hint survives instead of having its brackets escaped", () => {
    const src = "> [!note|left] Title\n> Body.\n";
    const doc = markdownToDoc(src);
    expect(doc.content[0]?.type).toBe("callout");
    expect(doc.content[0]?.attrs?.kind).toBe("note|left");
    expect(docToMarkdown(doc)).toBe(src);
  });

  it("an unknown callout kind is kept rather than rewritten to one AML knows", () => {
    const src = "> [!bryces-own]+ Title\n> Body.\n";
    const doc = markdownToDoc(src);
    expect(doc.content[0]?.attrs).toEqual({ kind: "bryces-own", fold: "+" });
    expect(docToMarkdown(doc)).toBe(src);
  });

  it("marks nest correctly on the way back", () => {
    const doc: PmNode = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "a ", marks: [{ type: "bold" }] },
            { type: "text", text: "b", marks: [{ type: "bold" }, { type: "italic" }] },
            { type: "text", text: " c", marks: [{ type: "bold" }] },
            { type: "text", text: " and " },
            { type: "text", text: "code", marks: [{ type: "code" }] },
            {
              type: "text",
              text: " link",
              marks: [{ type: "link", attrs: { href: "x.md", title: null } }],
            },
          ],
        },
      ],
    };
    expect(docToMarkdown(doc)).toBe("**a *b* c** and `code` [link](x.md)\n");
  });

  it("tables keep alignment and header row", () => {
    const src = "| Left | Centre | Right |\n| :--- | :----: | ----: |\n| a    |    b   |     c |\n";
    const doc = markdownToDoc(src);
    const table = doc.content[0];
    expect(table?.type).toBe("table");
    expect(table?.attrs?.align).toEqual(["left", "center", "right"]);
    expect(table?.content?.[0]?.content?.[0]?.type).toBe("tableHeader");
    expect(docToMarkdown(doc)).toBe(src);
  });

  it("task lists and loose lists survive", () => {
    const src = "- [ ] open\n- [x] done\n  - [ ] nested\n\n1. loose one\n\n2. loose two\n";
    expect(docToMarkdown(markdownToDoc(src))).toBe(src);
  });

  it("empty document serialises to empty string", () => {
    expect(docToMarkdown({ type: "doc", content: [{ type: "paragraph" }] })).toBe("");
  });
});
