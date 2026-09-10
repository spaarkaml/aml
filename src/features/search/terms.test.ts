import { describe, expect, it } from "vitest";
import { termsToRegex, textTermsOf } from "./terms";

describe("textTermsOf", () => {
  it("keeps words and phrases, drops fields, exclusions and operators", () => {
    expect(
      textTermsOf('tag:#research bounding:Academic -status:done "information operations" ops'),
    ).toEqual([
      { kind: "phrase", value: "information operations" },
      { kind: "word", value: "ops" },
    ]);
    expect(textTermsOf('a OR b -c (d) title:"x y" e')).toEqual([
      { kind: "word", value: "a" },
      { kind: "word", value: "b" },
      { kind: "word", value: "d" },
      { kind: "word", value: "e" },
    ]);
  });
  it("understands regex terms and URL-like words", () => {
    expect(textTermsOf("/inter\\w+/i http://x.y/a 12:30")).toEqual([
      { kind: "regex", value: "inter\\w+" },
      { kind: "word", value: "http://x.y/a" },
      { kind: "word", value: "12:30" },
    ]);
    expect(textTermsOf("/unterminated")).toEqual([{ kind: "word", value: "/unterminated" }]);
  });
  it("builds a combined matcher", () => {
    const re = termsToRegex(textTermsOf('alpha "b c" /d+/'));
    expect("Alpha B c dd".match(re as RegExp)).toEqual(["Alpha", "B c", "dd"]);
    expect(termsToRegex([])).toBeNull();
    expect(termsToRegex([{ kind: "regex", value: "(" }])).toBeNull();
  });
});
