import { useTabsStore } from "./store";

const s = () => useTabsStore.getState();

beforeEach(() => {
  useTabsStore.setState({ folioRoot: "/f", byFolio: {}, back: [], forward: [] });
});

describe("tabs store", () => {
  it("opens tabs, activates, and de-duplicates", () => {
    s().open("a.md");
    s().open("b.md");
    s().open("a.md");
    expect(s().current().tabs).toEqual(["a.md", "b.md"]);
    expect(s().current().active).toBe("a.md");
  });

  it("closing the active tab activates its neighbour", () => {
    s().open("a.md");
    s().open("b.md");
    s().open("c.md");
    s().close("c.md");
    expect(s().current().active).toBe("b.md");
    s().close("a.md");
    expect(s().current().tabs).toEqual(["b.md"]);
    s().close("b.md");
    expect(s().current().active).toBeNull();
  });

  it("back and forward walk the visit history", () => {
    s().open("a.md");
    s().open("b.md");
    s().open("c.md");
    expect(s().back).toEqual(["a.md", "b.md"]);
    s().goBack();
    expect(s().current().active).toBe("b.md");
    expect(s().back).toEqual(["a.md"]);
    expect(s().forward).toEqual(["c.md"]);
    s().goBack();
    expect(s().current().active).toBe("a.md");
    s().goForward();
    expect(s().current().active).toBe("b.md");
    s().goForward();
    expect(s().current().active).toBe("c.md");
    expect(s().forward).toEqual([]);
    s().goForward();
    expect(s().current().active).toBe("c.md");
  });

  it("a new visit clears the forward stack", () => {
    s().open("a.md");
    s().open("b.md");
    s().goBack();
    s().open("z.md");
    expect(s().forward).toEqual([]);
    expect(s().back).toEqual(["a.md"]);
  });

  it("rename updates tabs, active and history, including children of a folder", () => {
    s().open("old/a.md");
    s().open("old/b.md");
    s().rename("old", "new");
    expect(s().current().tabs).toEqual(["new/a.md", "new/b.md"]);
    expect(s().current().active).toBe("new/b.md");
    expect(s().back).toEqual(["new/a.md"]);
  });

  it("keeps tabs per Folio", () => {
    s().open("a.md");
    s().setFolio("/g");
    expect(s().current().tabs).toEqual([]);
    s().setFolio("/f");
    expect(s().current().tabs).toEqual(["a.md"]);
  });
});
