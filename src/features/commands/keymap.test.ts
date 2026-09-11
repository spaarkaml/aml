import { describe, expect, it } from "vitest";
import { registerShellCommands } from "@/app/commands";
import { conflictOf, duplicateShortcuts, sameShortcut, shortcutFromEvent } from "./keymap";
import { commandRegistry } from "./registry";

const press = (
  key: string,
  mods: Partial<Record<"metaKey" | "ctrlKey" | "altKey" | "shiftKey", boolean>> = {},
) => ({
  key,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe("shortcutFromEvent", () => {
  it("writes mod for the platform's own key, so a binding means the same on both machines", () => {
    expect(shortcutFromEvent(press("k", { metaKey: true }), true)).toEqual({ shortcut: "mod+k" });
    expect(shortcutFromEvent(press("k", { ctrlKey: true }), false)).toEqual({ shortcut: "mod+k" });
    // Control on a Mac is its own modifier, not mod.
    expect(shortcutFromEvent(press("k", { ctrlKey: true }), true)).toEqual({ shortcut: "ctrl+k" });
    expect(shortcutFromEvent(press("E", { metaKey: true, shiftKey: true }), true)).toEqual({
      shortcut: "mod+shift+e",
    });
    expect(shortcutFromEvent(press(" ", { altKey: true }), true)).toEqual({
      shortcut: "alt+space",
    });
  });

  it("refuses a modifier on its own and a bare letter, but allows F-keys", () => {
    expect(shortcutFromEvent(press("Shift", { shiftKey: true }), true)).toEqual({
      error: "modifier",
    });
    expect(shortcutFromEvent(press("a"), true)).toEqual({ error: "needsModifier" });
    expect(shortcutFromEvent(press("F2"), true)).toEqual({ shortcut: "f2" });
    expect(shortcutFromEvent(press("Escape"), true)).toEqual({ shortcut: "escape" });
  });
});

describe("sameShortcut", () => {
  it("ignores the order modifiers are written in", () => {
    expect(sameShortcut("mod+shift+e", "shift+mod+e")).toBe(true);
    expect(sameShortcut("mod+e", "mod+shift+e")).toBe(false);
    expect(sameShortcut("mod+e", "mod+f")).toBe(false);
  });
});

describe("the shipped keymap", () => {
  it("binds no key to two commands", () => {
    registerShellCommands();
    const all = commandRegistry.all();
    expect(all.length).toBeGreaterThan(40);
    expect(duplicateShortcuts(all, (c) => commandRegistry.shortcutOf(c))).toEqual([]);
  });

  it("gives every command a title, and every shortcut a command that exists", () => {
    for (const c of commandRegistry.all()) {
      expect(c.title.trim()).not.toBe("");
      expect(typeof c.run).toBe("function");
    }
  });

  it("finds the command already holding a key, and rebinding follows through", () => {
    const all = commandRegistry.all();
    const clash = conflictOf(all, (c) => commandRegistry.shortcutOf(c), "note.new", "mod+o");
    expect(clash?.id).toBe("note.quickOpen");

    commandRegistry.setOverrides({ "note.quickOpen": "mod+shift+o" });
    expect(commandRegistry.shortcutOf("note.quickOpen")).toBe("mod+shift+o");
    expect(commandRegistry.isRebound("note.quickOpen")).toBe(true);
    // The old key is free again, and the new one is taken.
    expect(
      conflictOf(all, (c) => commandRegistry.shortcutOf(c), "note.new", "mod+o"),
    ).toBeUndefined();
    expect(
      conflictOf(all, (c) => commandRegistry.shortcutOf(c), "note.new", "mod+shift+o")?.id,
    ).toBe("note.quickOpen");

    // Unbinding leaves it with no key at all; clearing the override restores the default.
    commandRegistry.setOverrides({ "note.quickOpen": null });
    expect(commandRegistry.shortcutOf("note.quickOpen")).toBeUndefined();
    commandRegistry.setOverrides({});
    expect(commandRegistry.shortcutOf("note.quickOpen")).toBe("mod+o");
    expect(commandRegistry.isRebound("note.quickOpen")).toBe(false);
  });
});
