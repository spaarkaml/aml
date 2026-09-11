import { describe, expect, it } from "vitest";
import { sentenceAt, sentenceEnds } from "./sentences";

const at = (text: string, offset: number) => {
  const [from, to] = sentenceAt(text, offset);
  return text.slice(from, to);
};

describe("sentenceEnds", () => {
  it("ends on terminators followed by a gap, and always at the end of the text", () => {
    expect(sentenceEnds("One. Two! Three?")).toEqual([4, 9, 16]);
    expect(sentenceEnds("No terminator here")).toEqual([18]);
    expect(sentenceEnds("")).toEqual([0]);
  });

  it("keeps decimals, abbreviations and file names whole", () => {
    expect(sentenceEnds("See p. 41 for more.")).toEqual([19]);
    expect(sentenceEnds("Fig. 2 shows it.")).toEqual([16]);
    expect(sentenceEnds("It grew 3.5 times.")).toEqual([18]);
    expect(sentenceEnds("Rid (e.g. 2020) says so.")).toEqual([24]);
    expect(sentenceEnds("Open 04 Methods.md now.")).toEqual([23]);
    expect(sentenceEnds("Used in the U.S. and here.")).toEqual([26]);
  });

  it("carries the closing quote or bracket with the sentence that ends", () => {
    expect(sentenceEnds('He said "stop." Then left.')).toEqual([15, 26]);
    expect(sentenceEnds("Really?! Yes.")).toEqual([8, 13]);
    expect(sentenceEnds("A pause… then more.")).toEqual([8, 19]);
  });
});

describe("sentenceAt", () => {
  const text = "The first one. A second, longer one! And a third?";
  it("finds the sentence the caret is in, without its leading space", () => {
    expect(at(text, 0)).toBe("The first one.");
    expect(at(text, 13)).toBe("The first one.");
    expect(at(text, 14)).toBe("The first one.");
    expect(at(text, 20)).toBe("A second, longer one!");
    expect(at(text, text.length)).toBe("And a third?");
  });

  it("gives the following sentence to a caret sitting in the gap", () => {
    // Offset 15 is the space after "one." — you are about to write the next sentence.
    expect(at(text, 15)).toBe("A second, longer one!");
  });

  it("handles an empty block and an out-of-range caret", () => {
    expect(sentenceAt("", 0)).toEqual([0, 0]);
    expect(at("Only one.", 99)).toBe("Only one.");
    expect(at("Only one.", -5)).toBe("Only one.");
  });
});
