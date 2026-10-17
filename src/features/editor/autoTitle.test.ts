import { describe, expect, it } from "vitest";
import type { PmDoc } from "@/lib/markdown";
import { fileNameFor, headingTitle, isAutoNamed } from "./autoTitle";

const h1 = (text: string): PmDoc => ({
  type: "doc",
  content: [{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text }] }],
});

describe("isAutoNamed", () => {
  it("knows the names a new note is given", () => {
    expect(isAutoNamed("Untitled.md")).toBe(true);
    expect(isAutoNamed("notes/Untitled 3.md")).toBe(true);
  });

  it("leaves a note the user has named alone", () => {
    expect(isAutoNamed("notes/Thesis outline.md")).toBe(false);
    expect(isAutoNamed("notes/Untitled thoughts.md")).toBe(false);
  });
});

describe("headingTitle", () => {
  it("reads a level-one heading at the top of the note", () => {
    expect(headingTitle(h1("Thesis outline"))).toBe("Thesis outline");
  });

  it("reads it through front matter", () => {
    const doc: PmDoc = {
      type: "doc",
      content: [{ type: "frontMatter", attrs: { yaml: "type: note" } }, ...h1("After").content],
    };
    expect(headingTitle(doc)).toBe("After");
  });

  it("joins the marks and the text inside the heading", () => {
    const doc: PmDoc = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [
            { type: "text", text: "A " },
            { type: "text", text: "bold", marks: [{ type: "bold" }] },
            { type: "text", text: " title" },
          ],
        },
      ],
    };
    expect(headingTitle(doc)).toBe("A bold title");
  });

  it("ignores anything that is not a title at the top", () => {
    expect(headingTitle({ type: "doc", content: [] })).toBeNull();
    expect(
      headingTitle({
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "First" }] },
          ...h1("Later").content,
        ],
      }),
    ).toBeNull();
    expect(
      headingTitle({
        type: "doc",
        content: [{ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "A" }] }],
      }),
    ).toBeNull();
    expect(headingTitle(h1("   "))).toBeNull();
  });
});

describe("fileNameFor", () => {
  it("keeps an ordinary title as it is", () => {
    expect(fileNameFor("Thesis outline")).toBe("Thesis outline");
  });

  it("drops the characters a file name cannot hold", () => {
    expect(fileNameFor("Where/when: why?")).toBe("Where when why");
    expect(fileNameFor('A "quoted" <title>')).toBe("A quoted title");
  });

  it("refuses a title that leaves nothing usable", () => {
    expect(fileNameFor("///")).toBeNull();
    expect(fileNameFor("...")).toBeNull();
    expect(fileNameFor("NUL")).toBeNull();
  });

  it("does not start with a dot or end with one", () => {
    expect(fileNameFor(".hidden")).toBe("hidden");
    expect(fileNameFor("Done.")).toBe("Done");
  });

  it("stays short enough for every path limit", () => {
    expect((fileNameFor("word ".repeat(40)) ?? "").length).toBeLessThanOrEqual(80);
  });
});
