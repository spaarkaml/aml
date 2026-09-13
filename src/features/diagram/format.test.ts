import { describe, expect, it } from "vitest";
import { diagramToSvg } from "./export";
import { fileNameFor, fromSvg, isDiagram, metadataOf, parse, serialise } from "./format";
import { addGroup, addNode, connect, emptyDiagram } from "./model";

function sample() {
  let d = emptyDiagram();
  [d] = addGroup(d, "circle", 200, 200);
  const [withSelf, selfId] = addNode(d, "self", 160, 160);
  const [withEvent, eventId] = addNode(withSelf, "event", 420, 160);
  d = connect(withEvent, eventId, selfId, "inhibits");
  d = {
    ...d,
    nodes: d.nodes.map((n) => (n.id === selfId ? { ...n, text: 'She said "stop"' } : n)),
    edges: d.edges.map((e) => ({ ...e, label: "−" })),
  };
  return d;
}

describe("the diagram file", () => {
  it("comes back out of its own text exactly as it went in", () => {
    const before = sample();
    const after = parse(serialise(before));
    expect(after).toEqual(before);
  });

  it("survives the round trip through a whole SVG", () => {
    const before = sample();
    const svg = diagramToSvg(before);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(isDiagram(svg)).toBe(true);
    expect(fromSvg(svg)).toEqual(before);
  });

  it("is one line per item, so a sync conflict is legible", () => {
    const text = serialise(sample());
    const lines = text.split("\n");
    expect(lines[0]).toBe("aml-diagram 1");
    expect(lines[1]).toMatch(/^size /);
    // header + size + one group + two nodes + one edge
    expect(lines).toHaveLength(6);
  });

  it("keeps quotes and angle brackets out of the XML's way", () => {
    const d = emptyDiagram();
    const [withNode, id] = addNode(d, "belief", 100, 100);
    const doc = {
      ...withNode,
      nodes: withNode.nodes.map((n) =>
        n.id === id ? { ...n, text: 'a < b & c > d, "quoted"' } : n,
      ),
    };
    const svg = diagramToSvg(doc);
    const meta = svg.slice(svg.indexOf("<metadata"), svg.indexOf("</metadata>"));
    // A stray `<` inside the metadata would end the element early and corrupt the file.
    expect(meta).toContain("&lt;");
    expect(meta).toContain("&amp;");
    expect(meta.slice(meta.indexOf(">") + 1)).not.toContain("<");
    expect(fromSvg(svg)?.nodes[0]?.text).toBe('a < b & c > d, "quoted"');
  });

  it("is not confused by somebody else's SVG", () => {
    expect(isDiagram('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>')).toBe(false);
    expect(fromSvg("<svg></svg>")).toBeNull();
  });

  it("reads a diagram written by a later AML as much of itself as it understands", () => {
    const text = [
      "aml-diagram 9",
      "size w=400 h=300",
      "node id=n1 kind=person x=10 y=10 w=90 h=90 tone=teal text=A mood=anxious",
      "node id=n2 kind=hologram x=200 y=10 w=90 h=90 tone=fuchsia text=B",
      "edge id=e1 from=n1 to=n2 kind=telepathy tone=neutral label=?",
      "sparkle id=s1 x=4",
    ].join("\n");
    const d = parse(text);
    expect(d.nodes).toHaveLength(2);
    // An unknown kind becomes a plain note rather than nothing, and an unknown tone neutral.
    expect(d.nodes[1]?.kind).toBe("note");
    expect(d.nodes[1]?.tone).toBe("neutral");
    // An unknown link still joins the two things it joined.
    expect(d.edges[0]?.kind).toBe("directed");
    expect(d.nodes[0]?.text).toBe("A");
  });

  it("drops an edge whose ends are not in the file rather than drawing into nowhere", () => {
    const d = parse(
      [
        "aml-diagram 1",
        "node id=n1 kind=person x=0 y=0 w=90 h=90 tone=teal text=A",
        "edge id=e1 from=n1 to=ghost kind=directed tone=neutral label=",
      ].join("\n"),
    );
    expect(d.edges).toHaveLength(0);
  });

  it("names the file after what the drawing is about", () => {
    const d = emptyDiagram();
    const [withNode, id] = addNode(d, "belief", 0, 0);
    const named = {
      ...withNode,
      nodes: withNode.nodes.map((n) => (n.id === id ? { ...n, text: "Threat appraisal" } : n)),
    };
    expect(fileNameFor(named)).toBe("threat-appraisal.svg");
    expect(fileNameFor(emptyDiagram())).toBe("diagram.svg");
  });

  it("carries its own paper, so it is readable on any background", () => {
    const svg = diagramToSvg(sample());
    expect(svg).toContain('fill="var(--paper)"');
    expect(svg).toContain("prefers-color-scheme:dark");
    expect(metadataOf(svg)).toContain("aml-diagram 1");
  });
});
