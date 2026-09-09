import type { NoteIndexEntry } from "@/ipc";
import { hasExactTitle, searchNotes } from "./search";

const entry = (path: string, extra: Partial<NoteIndexEntry> = {}): NoteIndexEntry => ({
  path,
  title: (path.split("/").pop() ?? path).replace(/\.md$/, ""),
  aliases: [],
  headings: [],
  mtime: 1,
  ...extra,
});

const entries = [
  entry("Thesis/chapters/03 Influence networks.md", {
    aliases: ["nets"],
    headings: ["Influence networks", "Three properties"],
  }),
  entry("Thesis/chapters/04 Methods.md", { headings: ["Interviews"] }),
  entry("Inbox.md"),
  entry("journal/2026-09-09.md", { title: "Tuesday" }),
];

describe("searchNotes", () => {
  it("lists recents first on an empty query, then the rest by title", () => {
    const r = searchNotes("", entries, ["Inbox.md", "journal/2026-09-09.md"]);
    expect(r.slice(0, 2).map((m) => [m.path, m.kind])).toEqual([
      ["Inbox.md", "recent"],
      ["journal/2026-09-09.md", "recent"],
    ]);
    expect(r.map((m) => m.title).slice(2)).toEqual(["03 Influence networks", "04 Methods"]);
  });

  it("ranks title matches above alias, heading and path matches", () => {
    const r = searchNotes("methods", entries);
    expect(r[0]?.path).toBe("Thesis/chapters/04 Methods.md");
    expect(r[0]?.kind).toBe("title");
  });

  it("matches aliases and headings and reports what matched", () => {
    expect(searchNotes("nets", entries)[0]).toMatchObject({ kind: "alias", detail: "nets" });
    const h = searchNotes("three prop", entries)[0];
    expect(h).toMatchObject({ kind: "heading", detail: "Three properties" });
  });

  it("falls back to the path and never lists a note twice", () => {
    const r = searchNotes("thesis", entries);
    expect(r.map((m) => m.path).sort()).toEqual([
      "Thesis/chapters/03 Influence networks.md",
      "Thesis/chapters/04 Methods.md",
    ]);
    expect(r.every((m) => m.kind === "path")).toBe(true);
  });

  it("drops notes that do not match", () => {
    expect(searchNotes("zzz", entries)).toEqual([]);
  });
});

describe("hasExactTitle", () => {
  it("is case-insensitive over titles and aliases", () => {
    expect(hasExactTitle("inbox", entries)).toBe(true);
    expect(hasExactTitle("NETS", entries)).toBe(true);
    expect(hasExactTitle("Inbox 2", entries)).toBe(false);
  });
});
