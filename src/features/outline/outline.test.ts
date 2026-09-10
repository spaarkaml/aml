import { describe, expect, it } from "vitest";
import { activeIndex, type DocLike, outlineOf, planMove, stepTarget } from "./outline";

/** A stand-in document: top-level nodes with the sizes ProseMirror would give them. */
function doc(
  ...nodes: Array<{ name: string; level?: number; text: string; size: number }>
): DocLike {
  return {
    forEach(f) {
      let offset = 0;
      nodes.forEach((n, i) => {
        f({ type: { name: n.name }, attrs: { level: n.level }, textContent: n.text }, offset, i);
        offset += n.size;
      });
    },
    content: { size: nodes.reduce((t, n) => t + n.size, 0) },
  };
}
const h = (level: number, text: string) => ({
  name: "heading",
  level,
  text,
  size: text.length + 2,
});
const p = (text: string) => ({ name: "paragraph", text, size: text.length + 2 });

describe("outlineOf", () => {
  it("nests by level, collapses skipped levels and ends each section at its next peer", () => {
    const d = doc(p("intro"), h(1, "One"), p("a"), h(2, "Two"), p("b"), h(1, "Three"), p("c"));
    expect(outlineOf(d).map((x) => [x.index, x.level, x.depth, x.text])).toEqual([
      [0, 1, 0, "One"],
      [1, 2, 1, "Two"],
      [2, 1, 0, "Three"],
    ]);
    const [one, two, three] = outlineOf(d);
    // "One" runs to "Three"; "Two" ends there too; the last section runs to the end.
    expect(one?.end).toBe(three?.pos);
    expect(two?.end).toBe(three?.pos);
    expect(three?.end).toBe(d.content.size);
  });

  it("indents an H1 → H3 jump once, not twice", () => {
    expect(outlineOf(doc(h(1, "One"), h(3, "Deep"), h(2, "Back"))).map((x) => x.depth)).toEqual([
      0, 1, 1,
    ]);
  });

  it("ignores everything that is not a heading", () => {
    expect(outlineOf(doc(p("just text"), p("more")))).toEqual([]);
  });
});

describe("activeIndex", () => {
  const headings = outlineOf(doc(p("intro"), h(1, "One"), p("a"), h(2, "Two"), p("b")));
  it("is the last heading at or before the caret, and -1 above them all", () => {
    expect(activeIndex(headings, 0)).toBe(-1);
    expect(activeIndex(headings, headings[0]?.pos ?? 0)).toBe(0);
    expect(activeIndex(headings, (headings[1]?.pos ?? 0) + 1)).toBe(1);
    expect(activeIndex(headings, 999)).toBe(1);
    expect(activeIndex([], 5)).toBe(-1);
  });
});

describe("planMove", () => {
  const d = doc(h(1, "One"), p("a"), h(1, "Two"), p("b"), h(1, "Three"), p("c"));
  const headings = outlineOf(d);

  it("moves a section before another heading, or to the end", () => {
    expect(planMove(headings, 2, 0, d.content.size)).toEqual({
      from: headings[2]?.pos,
      to: d.content.size,
      insert: headings[0]?.pos,
    });
    expect(planMove(headings, 0, headings.length, d.content.size)?.insert).toBe(d.content.size);
  });

  it("refuses a section into itself and a move that changes nothing", () => {
    expect(planMove(headings, 0, 0, d.content.size)).toBeNull();
    // Dropping on the heading right after the section is where it already is.
    expect(planMove(headings, 0, 1, d.content.size)).toBeNull();
    expect(planMove(headings, 9, 0, d.content.size)).toBeNull();
  });

  it("carries nested subsections with their parent", () => {
    const nested = doc(h(1, "One"), h(2, "Under"), p("a"), h(1, "Two"), p("b"));
    const hs = outlineOf(nested);
    const move = planMove(hs, 0, hs.length, nested.content.size);
    expect(move).toEqual({ from: 0, to: hs[2]?.pos, insert: nested.content.size });
  });
});

describe("stepTarget", () => {
  const hs = outlineOf(doc(h(1, "One"), h(2, "Under"), h(1, "Two"), h(1, "Three")));
  it("swaps with the neighbouring section at the same level", () => {
    expect(stepTarget(hs, 2, -1)).toBe(0);
    expect(stepTarget(hs, 0, 1)).toBe(3);
    expect(stepTarget(hs, 3, 1)).toBeNull();
    expect(stepTarget(hs, 0, -1)).toBeNull();
  });
});
