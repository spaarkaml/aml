import { describe, expect, it } from "vitest";
import type { BinderItem, Project } from "@/ipc";
import { cardColour, dropPlan, groupsOf, nestPlan, statsOf, statusesOf } from "./project";
import { titleOf } from "./split";

function item(rel: string, patch: Partial<BinderItem> = {}): BinderItem {
  const kind = rel.endsWith(".md") ? "note" : "folder";
  return {
    path: `The Salt Road/${rel}`,
    rel,
    name: rel.split("/").pop()?.replace(/\.md$/, "") ?? rel,
    kind,
    depth: rel.split("/").length - 1,
    include: true,
    words: 0,
    synopsis: "",
    label: "",
    status: "",
    ...patch,
  };
}

function project(binder: BinderItem[]): Project {
  return {
    path: "The Salt Road",
    name: "The Salt Road",
    title: "The Salt Road",
    target: null,
    deadline: null,
    binder,
  };
}

const book = () =>
  project([
    item("part one"),
    item("part one/01 Arrival.md", { words: 400, status: "drafting", label: "Scene" }),
    item("part one/02 The road.md", { words: 600, status: "drafting", include: false }),
    item("part two"),
    item("part two/03 Salt.md", { words: 250, status: "revised" }),
  ]);

describe("what a Project adds up to", () => {
  it("counts documents, parts and the words a compile would take", () => {
    const stats = statsOf(book());
    expect(stats).toEqual({
      documents: 3,
      parts: 2,
      words: 1250,
      // The excluded document's words are still the Project's; they are simply not the book's.
      includedWords: 650,
      excluded: 1,
    });
    expect(statsOf(null).words).toBe(0);
  });

  it("groups documents under their part, with a group for what comes before the first", () => {
    const loose = project([item("front matter.md", { words: 30 }), ...book().binder]);
    const groups = groupsOf(loose);
    expect(groups.map((g) => g.part?.name ?? null)).toEqual([null, "part one", "part two"]);
    expect(groups.map((g) => g.words)).toEqual([30, 1000, 250]);
    expect(groups[1]?.items.map((i) => i.name)).toEqual(["01 Arrival", "02 The road"]);
  });

  it("counts by status, most words first, with the unset ones last", () => {
    const rows = statusesOf(
      project([
        item("a.md", { words: 10, status: "revised" }),
        item("b.md", { words: 90 }),
        item("c.md", { words: 50, status: "drafting" }),
        item("d.md", { words: 5, status: "drafting" }),
      ]),
    );
    expect(rows).toEqual([
      { status: "drafting", documents: 2, words: 55 },
      { status: "revised", documents: 1, words: 10 },
      { status: "", documents: 1, words: 90 },
    ]);
  });

  it("gives a label the same colour everywhere, and no colour to nothing", () => {
    expect(cardColour("Scene")).toBe(cardColour("scene "));
    expect(cardColour("Scene")).not.toBe(cardColour("Interview"));
    expect(cardColour("  ")).toBeNull();
  });
});

describe("dragging in the Binder", () => {
  it("reorders inside a part without touching the disk", () => {
    const plan = dropPlan(book(), "part one/02 The road.md", "part one/01 Arrival.md", true);
    expect(plan?.move).toBeNull();
    expect(plan?.order).toEqual([
      "part one",
      "part one/02 The road.md",
      "part one/01 Arrival.md",
      "part two",
      "part two/03 Salt.md",
    ]);
  });

  it("moves the file when the document changes part", () => {
    const plan = dropPlan(book(), "part two/03 Salt.md", "part one/01 Arrival.md", false);
    expect(plan?.move).toEqual({
      from: "The Salt Road/part two/03 Salt.md",
      to: "The Salt Road/part one/03 Salt.md",
    });
    expect(plan?.order).toEqual([
      "part one",
      "part one/01 Arrival.md",
      "part one/03 Salt.md",
      "part one/02 The road.md",
      "part two",
    ]);
  });

  it("carries a part's documents with it and refuses to put one inside itself", () => {
    const plan = dropPlan(book(), "part two", "part one", true);
    expect(plan?.order).toEqual([
      "part two",
      "part one",
      "part one/01 Arrival.md",
      "part one/02 The road.md",
    ]);
    // The children follow on disk, so they are not listed again — reconciliation finds them.
    expect(dropPlan(book(), "part one", "part one/01 Arrival.md", true)).toBeNull();
    expect(dropPlan(book(), "part one", "part one", true)).toBeNull();
  });

  it("nests a document at the end of the part it is dropped on", () => {
    const plan = nestPlan(book(), "part two/03 Salt.md", "part one");
    expect(plan?.move).toEqual({
      from: "The Salt Road/part two/03 Salt.md",
      to: "The Salt Road/part one/03 Salt.md",
    });
    expect(plan?.order).toEqual([
      "part one",
      "part one/01 Arrival.md",
      "part one/02 The road.md",
      "part one/03 Salt.md",
      "part two",
    ]);
    // Already there, or into itself: nothing to do.
    expect(nestPlan(book(), "part one/01 Arrival.md", "part one")).toBeNull();
    expect(nestPlan(book(), "part one", "part one")).toBeNull();
  });

  it("refuses a move that would collide with a document already in that part", () => {
    const clash = project([
      item("part one"),
      item("part one/01 Arrival.md"),
      item("part two"),
      item("part two/01 Arrival.md"),
    ]);
    expect(nestPlan(clash, "part two/01 Arrival.md", "part one")).toBeNull();
  });
});

describe("splitting a document", () => {
  it("names the new one after its first heading", () => {
    expect(titleOf("## The road\n\nThree days east.\n")).toBe("The road");
    expect(titleOf("Three days east, and the water ran out on the second.\n")).toBe(
      "Three days east, and the water",
    );
    expect(titleOf("\n\n")).toBe("Untitled");
    // A heading that would make an unusable file name is made usable.
    expect(titleOf("# 03/04: the crossing")).toBe("03-04- the crossing");
  });
});
