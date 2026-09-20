import { Mark, mergeAttributes } from "@tiptap/core";
import { HIGHLIGHT_COLOURS } from "@/lib/markdown/highlight";
import type { HighlightColour } from "@/lib/markdown/types";

/**
 * Highlighting (WP-3.11): four colours behind a phrase, written to the file as `==…==` and
 * `==…=={blue}` (see `lib/markdown/highlight.ts` for why that syntax).
 *
 * A `<mark>` in the document, so a highlight pasted in from a browser arrives as one and the
 * colour is a plain attribute the stylesheet can key off — the four tones themselves are
 * tokens (ADR-013), not values in here.
 */

const DEFAULT: HighlightColour = "yellow";

function clean(value: unknown): HighlightColour {
  return HIGHLIGHT_COLOURS.includes(value as HighlightColour)
    ? (value as HighlightColour)
    : DEFAULT;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    highlight: {
      setHighlight: (attrs?: { colour?: HighlightColour }) => ReturnType;
      toggleHighlight: (attrs?: { colour?: HighlightColour }) => ReturnType;
      unsetHighlight: () => ReturnType;
    };
  }
}

export const Highlight = Mark.create({
  name: "highlight",

  addAttributes() {
    return {
      colour: {
        default: DEFAULT,
        parseHTML: (el: HTMLElement) =>
          clean(el.getAttribute("data-colour") ?? el.getAttribute("data-color")),
        renderHTML: (attrs: Record<string, unknown>) => ({ "data-colour": clean(attrs.colour) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "mark" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["mark", mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setHighlight:
        (attrs) =>
        ({ commands }) =>
          commands.setMark(this.name, { colour: clean(attrs?.colour) }),
      unsetHighlight:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
      // Toggling to the colour that is already there clears it; toggling to another recolours
      // rather than removing, which is what a row of four swatches should feel like.
      toggleHighlight:
        (attrs) =>
        ({ editor, commands }) => {
          const colour = clean(attrs?.colour);
          const active = editor.isActive(this.name, { colour });
          if (active) return commands.unsetMark(this.name);
          return commands.setMark(this.name, { colour });
        },
    };
  },

  // ⌘⇧H is Home and ⌥⌘H is the system's Hide Others, so the marker takes Y.
  addKeyboardShortcuts() {
    return {
      "Mod-Shift-y": () => this.editor.commands.toggleHighlight(),
      "Mod-Shift-Y": () => this.editor.commands.toggleHighlight(),
    };
  },
});
