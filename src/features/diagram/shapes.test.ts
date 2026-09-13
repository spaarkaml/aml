import { describe, expect, it } from "vitest";
import {
  addGroup,
  addNode,
  anchor,
  centre,
  connect,
  type DiagramEdge,
  type DiagramNode,
  emptyDiagram,
  extent,
  KINDS,
  membersOf,
  removeNode,
} from "./model";
import { edgeGeometry, innerOutlineOf, outlineOf, wrapText } from "./shapes";

function node(over: Partial<DiagramNode> = {}): DiagramNode {
  return { id: "n", kind: "behaviour", x: 0, y: 0, w: 100, h: 60, tone: "teal", text: "", ...over };
}

describe("text wrapping", () => {
  it("breaks on words and never mid-word", () => {
    const lines = wrapText("the salt flats at dusk", 90);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(" ")).toBe("the salt flats at dusk");
  });

  it("keeps a word that cannot fit rather than dropping it", () => {
    expect(wrapText("counterintelligence", 40)).toEqual(["counterintelligence"]);
  });

  it("honours the line breaks you typed", () => {
    expect(wrapText("one\ntwo", 400)).toEqual(["one", "two"]);
  });

  it("stops at four lines: past that it is a paragraph, not a label", () => {
    expect(wrapText("a b c d e f g h i j k l", 20)).toHaveLength(4);
  });
});

describe("outlines", () => {
  it("gives every kind a path", () => {
    for (const kind of Object.keys(KINDS) as (keyof typeof KINDS)[]) {
      const d = outlineOf(node({ kind }));
      expect(d.startsWith("M"), kind).toBe(true);
      expect(d).not.toContain("NaN");
    }
  });

  it("doubles only the two kinds that are drawn doubled", () => {
    expect(innerOutlineOf(node({ kind: "self" }))).not.toBeNull();
    expect(innerOutlineOf(node({ kind: "outcome" }))).not.toBeNull();
    expect(innerOutlineOf(node({ kind: "person" }))).toBeNull();
  });
});

describe("where a link meets a shape", () => {
  it("stops on the boundary, not at the centre", () => {
    const a = node({ id: "a", kind: "person", x: 0, y: 0, w: 100, h: 100 });
    const at = anchor(a, { x: 400, y: 50 });
    expect(at.x).toBeCloseTo(100, 1);
    expect(at.y).toBeCloseTo(50, 1);
  });

  it("follows the ellipse for a round shape rather than its corner", () => {
    const a = node({ id: "a", kind: "person", x: 0, y: 0, w: 100, h: 100 });
    const at = anchor(a, { x: 200, y: 200 });
    // On the circle of radius 50 about (50,50), not at the box corner (100,100).
    expect(Math.hypot(at.x - 50, at.y - 50)).toBeCloseTo(50, 1);
  });

  it("puts an arrowhead on the target and only on the target", () => {
    const a = node({ id: "a", x: 0, y: 0 });
    const b = node({ id: "b", x: 300, y: 0 });
    const edge: DiagramEdge = {
      id: "e",
      from: "a",
      to: "b",
      kind: "directed",
      tone: "neutral",
      label: "",
    };
    expect(edgeGeometry(edge, a, b).heads).toHaveLength(1);
    expect(edgeGeometry({ ...edge, kind: "mutual" }, a, b).heads).toHaveLength(2);
    expect(edgeGeometry({ ...edge, kind: "plain" }, a, b).heads).toHaveLength(0);
  });

  it("draws the notations that mean something different from an arrow", () => {
    const a = node({ id: "a", x: 0, y: 0 });
    const b = node({ id: "b", x: 300, y: 0 });
    const base: DiagramEdge = {
      id: "e",
      from: "a",
      to: "b",
      kind: "close",
      tone: "neutral",
      label: "",
    };
    expect(edgeGeometry(base, a, b).twin).not.toBeNull();
    expect(edgeGeometry({ ...base, kind: "cutoff" }, a, b).cut).not.toBeNull();
    expect(edgeGeometry({ ...base, kind: "cutoff" }, a, b).dashed).toBe(true);
    // Conflict is a saw-tooth, so its path has many segments rather than one.
    expect(
      edgeGeometry({ ...base, kind: "conflict" }, a, b).path.split("L").length,
    ).toBeGreaterThan(5);
  });
});

describe("the document", () => {
  it("places a new shape by its centre, where you pointed", () => {
    const [d, id] = addNode(emptyDiagram(), "person", 200, 150);
    const placed = d.nodes.find((n) => n.id === id);
    expect(placed && centre(placed)).toEqual({ x: 200, y: 150 });
  });

  it("takes an edge away with the node it was attached to", () => {
    let d = emptyDiagram();
    const [one, a] = addNode(d, "person", 0, 0);
    const [two, b] = addNode(one, "event", 300, 0);
    d = connect(two, a, b);
    expect(d.edges).toHaveLength(1);
    expect(removeNode(d, a).edges).toHaveLength(0);
  });

  it("refuses to join a thing to itself", () => {
    const [d, a] = addNode(emptyDiagram(), "person", 0, 0);
    expect(connect(d, a, a).edges).toHaveLength(0);
  });

  it("counts a group's members by where they are standing", () => {
    let d = emptyDiagram();
    const [withGroup, g] = addGroup(d, "circle", 200, 200);
    const [withInside] = addNode(withGroup, "person", 200, 200);
    const [withOutside] = addNode(withInside, "person", 650, 480);
    d = withOutside;
    const group = d.groups.find((it) => it.id === g);
    expect(group && membersOf(d, group)).toHaveLength(1);
  });

  it("fits the page to what is drawn on it", () => {
    const [d] = addNode(emptyDiagram(), "person", 900, 700);
    const box = extent(d);
    expect(box.width).toBeGreaterThan(900);
    expect(box.height).toBeGreaterThan(700);
  });
});
