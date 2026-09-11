import type { PmNode } from "@/lib/markdown";
import { readabilityOf, sectionsOf, statsOf, syllables } from "./stats";

const p = (text: string): PmNode => ({ type: "paragraph", content: [{ type: "text", text }] });
const h = (level: number, text: string): PmNode => ({
  type: "heading",
  attrs: { level },
  content: [{ type: "text", text }],
});
const doc = (...content: PmNode[]): PmNode => ({ type: "doc", content });

describe("statistics", () => {
  it("counts words, characters, sentences and paragraphs of the prose", () => {
    const d = doc(p("One two three. Four five!"), p("Six seven."));
    const s = statsOf(d);
    expect(s.words).toBe(7);
    expect(s.sentences).toBe(3);
    expect(s.paragraphs).toBe(2);
    expect(s.charactersNoSpaces).toBeLessThan(s.characters);
  });

  it("counts the same text the status bar counts (Q19)", () => {
    const d = doc(
      { type: "frontMatter", attrs: { yaml: "type: chapter\nstatus: drafting" } },
      h(1, "A heading counts"),
      p("Body words here."),
      { type: "codeBlock", content: [{ type: "text", text: "const never = counted;" }] },
      { type: "rawBlock", attrs: { markdown: "<!-- nor this -->" } },
    );
    const s = statsOf(d);
    // 3 from the heading + 3 from the paragraph; nothing from the front matter, the code or
    // the comment.
    expect(s.words).toBe(6);
    expect(s.paragraphs).toBe(1);
  });

  it("is all zeroes for an empty note rather than a division by nothing", () => {
    expect(statsOf(doc(p("")))).toMatchObject({ words: 0, sentences: 0, readability: null });
    expect(statsOf(null).words).toBe(0);
  });

  it("counts a paragraph with no full stop as one sentence", () => {
    expect(statsOf(doc(p("A title-like line with no stop"))).sentences).toBe(1);
  });
});

describe("readability", () => {
  it("says nothing at all when there is too little text to mean anything", () => {
    expect(readabilityOf("Short.", 1, 1)).toBeNull();
    expect(readabilityOf("x".repeat(100), 30, 0)).toBeNull();
  });

  it("puts plain prose above dense prose", () => {
    const plain = "The cat sat on the mat. ".repeat(6);
    const dense =
      "The epistemological ramifications of institutionalised communicative asymmetry " +
      "necessitate a reconsideration of methodological individualism. ".repeat(2);
    const a = readabilityOf(plain, 36, 6);
    const b = readabilityOf(dense, 30, 2);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect((a as { ease: number }).ease).toBeGreaterThan((b as { ease: number }).ease);
    expect((a as { grade: number }).grade).toBeLessThan((b as { grade: number }).grade);
  });

  it("estimates syllables the usual way", () => {
    expect(syllables("cat")).toBe(1);
    expect(syllables("writing")).toBe(2);
    expect(syllables("methodology")).toBe(5);
    expect(syllables("")).toBe(0);
  });
});

describe("sections", () => {
  it("counts a heading's section with its subsections in it", () => {
    const d = doc(
      h(1, "Chapter"),
      p("one two three"),
      h(2, "First part"),
      p("four five"),
      h(2, "Second part"),
      p("six"),
      h(1, "Next chapter"),
      p("seven eight"),
    );
    const sections = sectionsOf(d);
    expect(sections.map((s) => [s.text, s.words])).toEqual([
      // The chapter's own words plus both its parts', heading text included.
      ["Chapter", 11],
      ["First part", 4],
      ["Second part", 3],
      ["Next chapter", 4],
    ]);
    // Depth collapses skipped levels, as the Outline shows them.
    expect(sections.map((s) => s.depth)).toEqual([0, 1, 1, 0]);
  });

  it("reports what is written before the first heading, and only when there is some", () => {
    expect(sectionsOf(doc(p("loose words here"), h(1, "Later")))[0]).toMatchObject({
      text: "",
      words: 3,
    });
    expect(sectionsOf(doc(h(1, "Straight in"), p("words")))[0]?.text).toBe("Straight in");
  });

  it("is empty for a note with nothing in it", () => {
    expect(sectionsOf(doc())).toEqual([]);
  });
});
