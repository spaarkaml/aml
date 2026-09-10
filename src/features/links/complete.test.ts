import { describe, expect, it } from "vitest";
import type { NoteIndexEntry } from "@/ipc";
import { suggestLinks, wikiRaw, wikiTarget } from "./complete";

const entries: NoteIndexEntry[] = [
  {
    path: "Thesis/04 Methods.md",
    title: "04 Methods",
    aliases: ["methodology"],
    headings: ["Methods", "Interview protocol"],
    mtime: 1,
  },
  { path: "Inbox.md", title: "Inbox", aliases: [], headings: [], mtime: 1 },
  { path: "a/Note.md", title: "Note", aliases: [], headings: [], mtime: 1 },
  { path: "b/Note.md", title: "Note", aliases: [], headings: [], mtime: 1 },
];
const first = <T>(xs: T[]): T => xs[0] as T;

describe("suggestLinks", () => {
  it("ranks titles, labels alias matches, and offers to create", () => {
    const s = suggestLinks("meth", entries);
    expect(first(s).target).toBe("04 Methods");
    expect(first(s).alias).toBeNull();
    const byAlias = suggestLinks("methodology", entries);
    expect(first(byAlias).alias).toBe("methodology");
    expect(wikiRaw(first(byAlias))).toBe("[[04 Methods|methodology]]");
    const none = suggestLinks("zzz", entries);
    expect(none).toHaveLength(1);
    expect(first(none).create).toBe(true);
    expect(first(none).target).toBe("zzz");
  });
  it("uses the full path when a stem is ambiguous", () => {
    expect(wikiTarget(entries[2] as NoteIndexEntry, entries)).toBe("a/Note");
    expect(wikiTarget(entries[1] as NoteIndexEntry, entries)).toBe("Inbox");
  });
  it("lists headings after #", () => {
    const s = suggestLinks("04 Methods#inter", entries);
    expect(s.map((x) => x.heading)).toEqual(["Interview protocol"]);
    expect(wikiRaw(first(s))).toBe("[[04 Methods#Interview protocol]]");
    expect(suggestLinks("nothing#x", entries)).toEqual([]);
  });
  it("does not offer to create an exact existing title", () => {
    expect(suggestLinks("Inbox", entries).some((x) => x.create)).toBe(false);
  });
});
