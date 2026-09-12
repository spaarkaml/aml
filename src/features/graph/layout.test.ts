import { describe, expect, it } from "vitest";
import type { Graph } from "@/ipc";
import { bounds, fitView, neighboursOf, nodeAt, radiusOf, seed, settle, step } from "./layout";

function node(path: string, cluster: string | null = null, degree = 2) {
  return {
    path,
    title: path.replace(".md", ""),
    words: 100,
    outgoing: degree,
    incoming: 0,
    cluster,
    depth: 0,
  };
}

function graph(nodes: ReturnType<typeof node>[], edges: [string, string, number?][] = []): Graph {
  return {
    nodes,
    edges: edges.map(([from, to, count]) => ({ from, to, count: count ?? 1 })),
    clusters: [],
    total: nodes.length,
    truncated: false,
  };
}

/** Distance between two notes once the layout has settled. */
function apart(sim: ReturnType<typeof seed>, a: string, b: string): number {
  const x = sim.nodes.find((n) => n.path === a);
  const y = sim.nodes.find((n) => n.path === b);
  if (!x || !y) throw new Error(`missing ${a} or ${b}`);
  return Math.hypot(x.x - y.x, x.y - y.y);
}

describe("seed", () => {
  it("puts a Folio in the same place every time it is opened", () => {
    const g = graph([node("a.md"), node("b.md"), node("c.md")]);
    expect(seed(g).nodes.map((n) => [n.x, n.y])).toEqual(seed(g).nodes.map((n) => [n.x, n.y]));
  });

  it("drops an edge whose notes are not in the graph", () => {
    const g = graph([node("a.md")], [["a.md", "gone.md"]]);
    expect(seed(g).edges).toHaveLength(0);
  });

  it("keeps no two notes on the same spot", () => {
    const sim = seed(graph([node("a.md"), node("b.md"), node("c.md"), node("d.md")]));
    const places = new Set(sim.nodes.map((n) => `${Math.round(n.x)},${Math.round(n.y)}`));
    expect(places.size).toBe(4);
  });
});

describe("the forces", () => {
  it("pulls linked notes together and leaves unlinked ones apart", () => {
    const g = graph([node("a.md"), node("b.md"), node("c.md")], [["a.md", "b.md"]]);
    const sim = settle(seed(g));
    expect(apart(sim, "a.md", "b.md")).toBeLessThan(apart(sim, "a.md", "c.md"));
  });

  it("pushes notes that start on top of each other apart", () => {
    const sim = seed(graph([node("a.md"), node("b.md")]));
    for (const n of sim.nodes) {
      n.x = 0;
      n.y = 0;
    }
    settle(sim);
    expect(apart(sim, "a.md", "b.md")).toBeGreaterThan(10);
  });

  it("draws two notes closer the more links run between them", () => {
    const one = settle(seed(graph([node("a.md"), node("b.md")], [["a.md", "b.md", 1]])));
    const many = settle(seed(graph([node("a.md"), node("b.md")], [["a.md", "b.md", 8]])));
    expect(apart(many, "a.md", "b.md")).toBeLessThan(apart(one, "a.md", "b.md"));
  });

  it("gathers a Bounding together, which is the whole point of the picture", () => {
    // Two Boundings, no links at all: nothing but the clustering force to separate them.
    const g = graph([
      node("t1.md", "thesis"),
      node("t2.md", "thesis"),
      node("t3.md", "thesis"),
      node("r1.md", "reading"),
      node("r2.md", "reading"),
      node("r3.md", "reading"),
    ]);
    const sim = settle(seed(g));
    const within = [apart(sim, "t1.md", "t2.md"), apart(sim, "r1.md", "r2.md")];
    const across = [apart(sim, "t1.md", "r1.md"), apart(sim, "t2.md", "r2.md")];
    expect(Math.max(...within)).toBeLessThan(Math.min(...across));
  });

  it("settles rather than shivering for ever", () => {
    const g = graph(
      [node("a.md"), node("b.md"), node("c.md"), node("d.md")],
      [
        ["a.md", "b.md"],
        ["b.md", "c.md"],
        ["c.md", "d.md"],
      ],
    );
    const sim = settle(seed(g));
    expect(step(sim)).toBeLessThan(1);
    expect(sim.alpha).toBeLessThan(0.5);
  });

  it("leaves a pinned note where it was put", () => {
    const sim = seed(graph([node("a.md"), node("b.md")], [["a.md", "b.md"]]));
    const a = sim.nodes.find((n) => n.path === "a.md");
    if (!a) throw new Error("no a");
    a.pinned = true;
    a.x = 500;
    a.y = -250;
    settle(sim);
    expect([a.x, a.y]).toEqual([500, -250]);
  });
});

describe("reading the drawing", () => {
  it("sizes a dot by how busy the note is, but not in proportion", () => {
    expect(radiusOf({ degree: 0 })).toBeLessThan(radiusOf({ degree: 4 }));
    expect(radiusOf({ degree: 100 })).toBeLessThan(radiusOf({ degree: 4 }) * 10);
  });

  it("fits the drawing inside the canvas", () => {
    const sim = settle(seed(graph([node("a.md"), node("b.md"), node("c.md")])));
    const box = bounds(sim.nodes);
    const view = fitView(box, 800, 600);
    const left = box.minX * view.scale + view.x;
    const right = box.maxX * view.scale + view.x;
    expect(left).toBeGreaterThanOrEqual(0);
    expect(right).toBeLessThanOrEqual(800);
  });

  it("finds the note under the pointer, and nothing when there is none", () => {
    const sim = seed(graph([node("a.md"), node("b.md")]));
    const a = sim.nodes[0];
    if (!a) throw new Error("no a");
    expect(nodeAt(sim.nodes, a.x, a.y)?.path).toBe(a.path);
    expect(nodeAt(sim.nodes, 99999, 99999)).toBeNull();
  });

  it("lists a note's neighbours in either direction", () => {
    const sim = seed(
      graph(
        [node("a.md"), node("b.md"), node("c.md")],
        [
          ["a.md", "b.md"],
          ["c.md", "a.md"],
        ],
      ),
    );
    expect(neighboursOf(sim, "a.md")).toEqual(new Set(["b.md", "c.md"]));
    expect(neighboursOf(sim, "nowhere.md").size).toBe(0);
  });
});
