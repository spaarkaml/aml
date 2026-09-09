import { fuzzyFilter, fuzzyScore } from "./fuzzy";

describe("fuzzyScore", () => {
  it("returns null when query is not a subsequence", () => {
    expect(fuzzyScore("xyz", "toggle layout")).toBeNull();
  });
  it("returns 0 for an empty query", () => {
    expect(fuzzyScore("", "anything")).toBe(0);
  });
  it("prefers word-start and consecutive matches", () => {
    const a = fuzzyScore("tl", "Toggle Layout") ?? -1;
    const b = fuzzyScore("tl", "Settle") ?? -1;
    expect(a).toBeGreaterThan(b);
  });
});

describe("fuzzyFilter", () => {
  it("orders best match first and drops non-matches", () => {
    const items = ["Open Folio", "Toggle Layout", "Take Snapshot", "Quit"];
    expect(fuzzyFilter("to", items, (s) => s)).toEqual(["Toggle Layout", "Take Snapshot"]);
  });
});
