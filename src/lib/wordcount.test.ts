import { markdownToDoc } from "@/lib/markdown";
import { countWords, countWordsInText } from "./wordcount";

describe("countWordsInText", () => {
  it("counts plain and hyphenated words, contractions, numbers", () => {
    expect(countWordsInText("The well-known author's 3 books")).toBe(5);
    expect(countWordsInText("colour, organise; centre.")).toBe(3);
    expect(countWordsInText("")).toBe(0);
  });
  it("counts CJK characters individually", () => {
    expect(countWordsInText("日本語の段落")).toBe(6);
  });
});

describe("countWords on a document", () => {
  it("excludes front matter and code, includes headings and lists", () => {
    const doc = markdownToDoc(
      "---\ntitle: skip these\n---\n\n# Two words\n\n- one\n- two\n\n```\nnot counted\n```\n\n<!-- hidden note -->\n\nend\n",
    );
    expect(countWords(doc)).toBe(5);
  });
});
