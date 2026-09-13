import { describe, expect, it } from "vitest";
import { type Choice, changes, compose, diff, hunks, words } from "./merge";

const none = new Map<number, Choice>();

describe("diff", () => {
  it("finds nothing between identical texts", () => {
    expect(diff(["a", "b"], ["a", "b"]).every((o) => o.kind === "same")).toBe(true);
  });

  it("finds the one paragraph that differs in the middle of a long note", () => {
    const a = ["# Title", "", "one", "", "two", "", "three"];
    const b = ["# Title", "", "one", "", "TWO", "", "three"];
    const ops = diff(a, b).filter((o) => o.kind !== "same");
    expect(ops).toEqual([
      { kind: "removed", a: "two" },
      { kind: "added", b: "TWO" },
    ]);
  });
});

describe("hunks and compose", () => {
  const original = "# Arrival\n\nShe reached the flats at dusk.\n\nThe salt was warm.\n";
  const copy =
    "# Arrival\n\nShe reached the flats at night.\n\nThe salt was warm.\n\nA new ending.\n";

  it("groups the differences, and composing either side gives that side back exactly", () => {
    const list = hunks(original, copy);
    expect(changes(list)).toHaveLength(2);
    expect(compose(list, none, "original", "note")).toBe(original);
    expect(compose(list, none, "copy", "note")).toBe(copy);
  });

  it("takes each difference from the side chosen for it", () => {
    const list = hunks(original, copy);
    const [first, second] = changes(list);
    const picks = new Map<number, Choice>([
      [first?.id ?? -1, "original"],
      [second?.id ?? -1, "copy"],
    ]);
    const out = compose(list, picks, "original", "note");
    expect(out).toContain("at dusk.");
    expect(out).not.toContain("at night.");
    expect(out).toContain("A new ending.");
  });

  it("keeps both versions of a paragraph as two paragraphs, never one fused line", () => {
    const list = hunks("Intro\n\nOld line.\n\nEnd", "Intro\n\nNew line.\n\nEnd");
    const out = compose(list, none, "both", "note");
    expect(out).toBe("Intro\n\nOld line.\n\nNew line.\n\nEnd");
  });

  it("keeps both sides of a settings file without repeating what they share", () => {
    const a = "- id: work\n  notes:\n    - a.md\n    - b.md\n";
    const b = "- id: work\n  notes:\n    - a.md\n    - c.md\n";
    const out = compose(hunks(a, b), none, "both", "settings");
    expect(out).toBe("- id: work\n  notes:\n    - a.md\n    - b.md\n    - c.md\n");
  });

  it("handles a side that is empty", () => {
    expect(compose(hunks("", "text"), none, "copy", "note")).toBe("text");
    expect(changes(hunks("same", "same"))).toHaveLength(0);
  });
});

describe("words", () => {
  it("marks only the words that differ inside a changed paragraph", () => {
    const w = words("She reached the flats at dusk.", "She reached the flats at night.");
    expect(w.original.filter((s) => s.kind === "removed").map((s) => s.text)).toEqual(["dusk."]);
    expect(w.copy.filter((s) => s.kind === "added").map((s) => s.text)).toEqual(["night."]);
    expect(w.original.map((s) => s.text).join("")).toBe("She reached the flats at dusk.");
  });
});
