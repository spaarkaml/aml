import { isMac } from "@/lib/platform";

/**
 * A command is anything a user can trigger from the Command Palette or a shortcut.
 * Shortcut grammar: "mod+shift+e", "mod+k", "escape". `mod` is ⌘ on macOS, Ctrl elsewhere.
 */
export interface Command {
  id: string;
  title: string;
  group?: string;
  shortcut?: string;
  /** When true the shortcut fires even while a text field has focus. */
  global?: boolean;
  run: () => void;
}

const MOD_KEYS = new Set(["mod", "ctrl", "alt", "shift", "meta"]);

export function parseShortcut(shortcut: string): { mods: Set<string>; key: string } {
  const parts = shortcut
    .toLowerCase()
    .split("+")
    .map((p) => p.trim());
  const mods = new Set(parts.filter((p) => MOD_KEYS.has(p)));
  const key = parts.find((p) => !MOD_KEYS.has(p)) ?? "";
  return { mods, key };
}

export function matchShortcut(shortcut: string, e: KeyboardEvent, mac: boolean = isMac): boolean {
  const { mods, key } = parseShortcut(shortcut);
  const wantMod = mods.has("mod");
  const wantCtrl = mods.has("ctrl") || (wantMod && !mac);
  const wantMeta = mods.has("meta") || (wantMod && mac);
  if (e.ctrlKey !== wantCtrl) return false;
  if (e.metaKey !== wantMeta) return false;
  if (e.shiftKey !== mods.has("shift")) return false;
  if (e.altKey !== mods.has("alt")) return false;
  return e.key.toLowerCase() === key;
}

export function formatShortcut(shortcut: string, mac: boolean = isMac): string {
  const { mods, key } = parseShortcut(shortcut);
  const label = (k: string) => {
    if (k === "escape") return "Esc";
    if (k === "enter") return "↩";
    if (k === "arrowup") return "↑";
    if (k === "arrowdown") return "↓";
    return k.length === 1 ? k.toUpperCase() : k;
  };
  if (mac) {
    const glyphs = [
      mods.has("ctrl") ? "⌃" : "",
      mods.has("alt") ? "⌥" : "",
      mods.has("shift") ? "⇧" : "",
      mods.has("mod") || mods.has("meta") ? "⌘" : "",
    ].join("");
    return `${glyphs}${label(key)}`;
  }
  const words = [
    mods.has("mod") || mods.has("ctrl") ? "Ctrl" : "",
    mods.has("alt") ? "Alt" : "",
    mods.has("shift") ? "Shift" : "",
    mods.has("meta") ? "Win" : "",
  ].filter(Boolean);
  return [...words, label(key)].join("+");
}

type Listener = () => void;

export class CommandRegistry {
  private readonly map = new Map<string, Command>();
  private readonly listeners = new Set<Listener>();
  private cache: Command[] = [];
  private dirty = true;

  register(...cmds: Command[]): () => void {
    for (const c of cmds) {
      if (this.map.has(c.id)) throw new Error(`command already registered: ${c.id}`);
      this.map.set(c.id, c);
    }
    this.emit();
    return () => {
      for (const c of cmds) this.map.delete(c.id);
      this.emit();
    };
  }

  get(id: string): Command | undefined {
    return this.map.get(id);
  }

  /** Sorted list; the same array instance is returned until the registry changes. */
  list(): Command[] {
    if (this.dirty) {
      this.cache = [...this.map.values()].sort((a, b) => a.title.localeCompare(b.title));
      this.dirty = false;
    }
    return this.cache;
  }

  run(id: string): boolean {
    const c = this.map.get(id);
    if (!c) return false;
    c.run();
    return true;
  }

  /** Returns the first command whose shortcut matches the event. */
  forEvent(e: KeyboardEvent, inTextField: boolean): Command | undefined {
    for (const c of this.map.values()) {
      if (!c.shortcut) continue;
      if (inTextField && !c.global) continue;
      if (matchShortcut(c.shortcut, e)) return c;
    }
    return undefined;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    this.dirty = true;
    for (const fn of this.listeners) fn();
  }
}

export const commandRegistry = new CommandRegistry();
