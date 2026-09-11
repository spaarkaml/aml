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
      if (import.meta.env.DEV) {
        // Exposed for e2e only: the suite presses every shortcut and checks what ran.
        (window as unknown as { __amlLastCommand?: string }).__amlLastCommand = cmd.id;
      }
      cmd.run();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
