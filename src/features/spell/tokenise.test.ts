import { getSchema } from "@tiptap/core";
import { amlExtensions } from "@/features/editor/extensions";
import { markdownToDoc } from "@/lib/markdown";
import { collectWords, normalise, skipWord } from "./tokenise";

const schema = getSchema(amlExtensions());

function wordsOf(md: string): string[] {
  const doc = schema.nodeFromJSON(markdownToDoc(md));
  return collectWords(doc).map((w) => w.word);
}

describe("tokenise", () => {
  it("skips acronyms, single letters and CamelCase", () => {
    expect(skipWord("AML")).toBe(true);
    expect(skipWord("a")).toBe(true);
    expect(skipWord("ProseMirror")).toBe(true);
    expect(skipWord("Colour")).toBe(false);
  });

  it("normalises possessives and quotes", () => {
    expect(normalise("Bryce's")).toBe("Bryce");
    expect(normalise("’tis’")).toBe("tis");
  });

  it("ignores front matter, code, links, atoms and yields positions", () => {
    const words = wordsOf(
      "---\ntitle: Ignored\n---\n\nSee [[Wiki Target]] and `codeword` and [linktext](https://x.y) plus #tagname.\n\n```\nfenced\n```\n\nColour organise.\n",
    );
    expect(words).toEqual(["See", "and", "and", "plus", "Colour", "organise"]);
    const doc = schema.nodeFromJSON(markdownToDoc("Hi there\n"));
    const spans = collectWords(doc);
    expect(spans.map((s) => doc.textBetween(s.from, s.to))).toEqual(["Hi", "there"]);
  });
});
