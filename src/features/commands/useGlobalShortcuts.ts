import { useEffect } from "react";
import { commandRegistry } from "./registry";

function isTextField(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/** Binds every registered command shortcut to window keydown. Mount once in the shell. */
export function useGlobalShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const cmd = commandRegistry.forEvent(e, isTextField(e.target));
      if (!cmd) return;
      e.preventDefault();
      e.stopPropagation();
      cmd.run();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
