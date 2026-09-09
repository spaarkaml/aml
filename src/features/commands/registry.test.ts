import { CommandRegistry, formatShortcut, matchShortcut } from "./registry";

const key = (init: KeyboardEventInit) => new KeyboardEvent("keydown", init);

describe("matchShortcut", () => {
  it("maps mod to meta on mac and ctrl elsewhere", () => {
    expect(matchShortcut("mod+k", key({ key: "k", metaKey: true }), true)).toBe(true);
    expect(matchShortcut("mod+k", key({ key: "k", ctrlKey: true }), true)).toBe(false);
    expect(matchShortcut("mod+k", key({ key: "k", ctrlKey: true }), false)).toBe(true);
  });
  it("requires exact modifier set", () => {
    expect(
      matchShortcut("mod+shift+e", key({ key: "E", metaKey: true, shiftKey: true }), true),
    ).toBe(true);
    expect(matchShortcut("mod+shift+e", key({ key: "e", metaKey: true }), true)).toBe(false);
  });
});

describe("formatShortcut", () => {
  it("renders glyphs on mac and words elsewhere", () => {
    expect(formatShortcut("mod+shift+e", true)).toBe("⇧⌘E");
    expect(formatShortcut("mod+shift+e", false)).toBe("Ctrl+Shift+E");
    expect(formatShortcut("escape", false)).toBe("Esc");
  });
});

describe("CommandRegistry", () => {
  it("registers, lists sorted, runs and unregisters", () => {
    const r = new CommandRegistry();
    const ran: string[] = [];
    const off = r.register(
      { id: "b", title: "Beta", run: () => ran.push("b") },
      { id: "a", title: "Alpha", run: () => ran.push("a") },
    );
    expect(r.list().map((c) => c.id)).toEqual(["a", "b"]);
    expect(r.run("a")).toBe(true);
    expect(ran).toEqual(["a"]);
    off();
    expect(r.list()).toEqual([]);
    expect(r.run("a")).toBe(false);
  });
  it("rejects duplicate ids", () => {
    const r = new CommandRegistry();
    r.register({ id: "x", title: "X", run: () => undefined });
    expect(() => r.register({ id: "x", title: "X", run: () => undefined })).toThrow();
  });
  it("skips non-global shortcuts inside text fields", () => {
    const r = new CommandRegistry();
    r.register(
      { id: "local", title: "L", shortcut: "mod+l", run: () => undefined },
      { id: "glob", title: "G", shortcut: "mod+g", global: true, run: () => undefined },
    );
    // jsdom reports no platform, so "mod" resolves to Ctrl here
    const evL = key({ key: "l", ctrlKey: true });
    const evG = key({ key: "g", ctrlKey: true });
    expect(r.forEvent(evL, true)?.id).toBeUndefined();
    expect(r.forEvent(evG, true)?.id).toBe("glob");
  });
});
