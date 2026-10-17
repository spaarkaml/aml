import { describe, expect, it } from "vitest";
import type { PmDoc, PmNode } from "@/lib/markdown";
import { reformatDoc } from "./reformat";

const doc = (...content: PmNode[]): PmDoc => ({ type: "doc", content });

/** A paragraph of plain text, as a plain-text paste leaves it: lines joined by hard breaks. */
const para = (...lines: string[]): PmNode => ({
  type: "paragraph",
  content: lines.flatMap((line, i) => {
    const text: PmNode[] = line ? [{ type: "text", text: line }] : [];
    return i === 0 ? text : [{ type: "hardBreak" }, ...text];
  }),
});

const BLANK: PmNode = { type: "paragraph" };

describe("reformatDoc", () => {
  it("turns a pasted heading into a heading", () => {
    const out = reformatDoc(doc(para("## A section"), para("Ordinary prose.")));
    expect(out?.content[0]).toMatchObject({ type: "heading", attrs: { level: 2 } });
    expect(out?.content[0]?.content?.[0]).toMatchObject({ text: "A section" });
  });

  it("turns a pasted list — one paragraph of hard-broken lines — into a list", () => {
    const out = reformatDoc(doc(para("- one", "- two", "- three")));
    expect(out?.content[0]?.type).toBe("bulletList");
    expect(out?.content[0]?.content).toHaveLength(3);
  });

  it("keeps a list tight when pasting split it into one paragraph per item", () => {
    const out = reformatDoc(doc(para("- one"), para("- two")));
    expect(out?.content[0]).toMatchObject({ type: "bulletList", attrs: { spread: false } });
  });

  it("puts the lines of a quote back into one block quote", () => {
    const out = reformatDoc(doc(para("> first line"), para("> second line")));
    expect(out?.content).toHaveLength(1);
    expect(out?.content[0]?.type).toBe("blockquote");
  });

  it("reads inline syntax inside the pasted text", () => {
    const out = reformatDoc(doc(para("Some **bold** words.")));
    const types = (out?.content[0]?.content ?? []).flatMap((n) =>
      (n.marks ?? []).map((m) => m.type),
    );
    expect(types).toContain("bold");
  });

  it("leaves a note that holds no markdown alone", () => {
    expect(reformatDoc(doc(para("Just a sentence."), para("And another.")))).toBeNull();
  });

  it("leaves text that is already formatted alone", () => {
    const bold: PmNode = {
      type: "paragraph",
      content: [{ type: "text", text: "already **bold**", marks: [{ type: "bold" }] }],
    };
    expect(reformatDoc(doc(bold))).toBeNull();
  });

  it("passes blocks that are not paragraphs through untouched", () => {
    const table: PmNode = { type: "table", content: [] };
    const out = reformatDoc(doc(para("# Title"), table, para("### Later")));
    expect(out?.content[1]).toBe(table);
    expect(out?.content[0]).toMatchObject({ type: "heading", attrs: { level: 1 } });
    expect(out?.content[2]).toMatchObject({ type: "heading", attrs: { level: 3 } });
  });

  it("does not read a rule in the middle of a note as front matter", () => {
    const out = reformatDoc(doc(para("Before."), para("---"), para("## After")));
    expect(out?.content.some((n) => n.type === "frontMatter")).toBe(false);
    expect(out?.content.some((n) => n.type === "horizontalRule")).toBe(true);
  });

  it("keeps a blank paragraph at the end, where the caret was", () => {
    const out = reformatDoc(doc(para("## Heading"), BLANK));
    expect(out).not.toBeNull();
    expect(out?.content.at(-1)).toEqual(BLANK);
  });

  it("returns a document the editor can load", () => {
    const out = reformatDoc(doc(para("# Only a heading")));
    expect(out?.type).toBe("doc");
    expect(out?.content.length).toBeGreaterThan(0);
  });
});
