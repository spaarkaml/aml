import { isMac } from "@/lib/platform";
import { type Command, parseShortcut } from "./registry";

/** Keys that are a modifier on their own and can never be a shortcut by themselves. */
const MODIFIER_KEYS = new Set(["shift", "control", "alt", "meta", "capslock", "dead"]);

/** Keys that need no modifier: function keys and the navigation block. */
const STANDALONE =
  /^(f\d{1,2}|escape|enter|tab|backspace|delete|home|end|pageup|pagedown|arrow(up|down|left|right))$/;

export type RecordError = "modifier" | "needsModifier";

/**
 * The shortcut a key press stands for, in the grammar `parseShortcut` reads, or the reason
 * it cannot be one. `mod` is ⌘ on macOS and Ctrl elsewhere, so a recorded shortcut means the
 * same thing on both machines — which matters when the Folio is shared between them.
 */
export function shortcutFromEvent(
  e: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">,
  mac: boolean = isMac,
): { shortcut: string } | { error: RecordError } {
  const key = e.key.toLowerCase();
  if (MODIFIER_KEYS.has(key)) return { error: "modifier" };
  const parts: string[] = [];
  if (mac ? e.metaKey : e.ctrlKey) parts.push("mod");
  if (mac && e.ctrlKey) parts.push("ctrl");
  if (e.altKey) parts.push("alt");
  if (e.shiftKey) parts.push("shift");
  if (parts.length === 0 && !STANDALONE.test(key)) return { error: "needsModifier" };
  parts.push(key === " " ? "space" : key);
  return { shortcut: parts.join("+") };
}

/** True when two shortcut strings would match the same key press, whatever their order. */
export function sameShortcut(a: string, b: string): boolean {
  const x = parseShortcut(a);
  const y = parseShortcut(b);
  return x.key === y.key && x.mods.size === y.mods.size && [...x.mods].every((m) => y.mods.has(m));
}

/** The command already using `shortcut`, if any — never the one being rebound. */
export function conflictOf(
  commands: Command[],
  effective: (c: Command) => string | undefined,
  id: string,
  shortcut: string,
): Command | undefined {
  return commands.find((c) => {
    if (c.id === id) return false;
    const other = effective(c);
    return !!other && sameShortcut(other, shortcut);
  });
}

/** Every shortcut bound twice, as `[shortcut, ids]` — empty when the keymap is sound. */
export function duplicateShortcuts(
  commands: Command[],
  effective: (c: Command) => string | undefined = (c) => c.shortcut,
): Array<[string, string[]]> {
  const seen: Array<{ shortcut: string; ids: string[] }> = [];
  for (const c of commands) {
    const s = effective(c);
    if (!s) continue;
    const hit = seen.find((x) => sameShortcut(x.shortcut, s));
    if (hit) hit.ids.push(c.id);
    else seen.push({ shortcut: s, ids: [c.id] });
  }
  return seen.filter((x) => x.ids.length > 1).map((x) => [x.shortcut, x.ids]);
}
