import { describe, expect, it } from "vitest";
import type { TagEntry } from "@/ipc";
import { ancestorsOf, buildTagTree, notesForTag } from "./tree";

const entries: TagEntry[] = [
  { tag: "thesis", path: "a.md", title: "A" },
  { tag: "thesis/ch3", path: "a.md", title: "A" },
  { tag: "thesis/ch3", path: "b.md", title: "B" },
  { tag: "thesis/ch4", path: "c.md", title: "C" },
  { tag: "solo", path: "b.md", title: "B" },
];

describe("buildTagTree", () => {
  it("nests tags and counts distinct notes per subtree", () => {
    const tree = buildTagTree(entries);
    expect(tree.map((n) => n.name)).toEqual(["solo", "thesis"]);
    const thesis = tree[1];
    expect(thesis?.notes).toBe(3);
    expect(thesis?.direct).toBe(1);
    expect(thesis?.children.map((c) => [c.tag, c.notes, c.direct])).toEqual([
      ["thesis/ch3", 2, 2],
      ["thesis/ch4", 1, 1],
    ]);
  });
  it("lists notes for a tag including nested ones, once each", () => {
    expect(notesForTag(entries, "thesis").map((e) => e.path)).toEqual(["a.md", "b.md", "c.md"]);
    expect(notesForTag(entries, "thesis/ch3").map((e) => e.path)).toEqual(["a.md", "b.md"]);
    expect(notesForTag(entries, "the")).toEqual([]);
  });
  it("knows a tag's ancestors", () => {
    expect(ancestorsOf("a/b/c")).toEqual(["a", "a/b"]);
    expect(ancestorsOf("solo")).toEqual([]);
  });
});
