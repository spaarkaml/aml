import type { Editor } from "@tiptap/core";

/** The one live editor instance (single note in WP-1.2; tabs make this a map in WP-1.5). */
let active: Editor | null = null;

export function setActiveEditor(editor: Editor | null): void {
  active = editor;
  if (import.meta.env.DEV) {
    // Exposed for e2e/debugging only; never present in production builds.
    (window as unknown as { __amlEditor?: Editor | null }).__amlEditor = editor;
  }
}

export function getActiveEditor(): Editor | null {
  return active;
}
