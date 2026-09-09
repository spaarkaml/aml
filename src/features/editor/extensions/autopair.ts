import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { parseWikiLink } from "@/lib/markdown/inline-syntax";

/**
 * Typora-style auto-pairing for brackets and quotes, plus wrap-on-type when text is selected:
 *   ( [ { "        insert the pair, caret between; typing the closer skips over it;
 *                  Backspace inside an empty pair removes both.
 *   * _ `          with a selection: toggle italic / italic / code (no literal markers in
 *                  WYSIWYG); without a selection they are left to the markdown input rules.
 *   [[Note]]       becomes a wiki-link atom the moment the second `]` lands (typed or skipped).
 *                  Done here rather than with an input rule: Tiptap's nodeInputRule keeps the
 *                  text around a capture group, and it would fire before the skip-over.
 * Nothing happens inside code blocks or inline code.
 */
const PAIRS: Record<string, string> = { "(": ")", "[": "]", "{": "}", '"': '"' };
const CLOSERS = new Set(Object.values(PAIRS));
const MARK_WRAP: Record<string, string> = { "*": "italic", _: "italic", "`": "code" };
const WIKI_TAIL = /\[\[([^[\]]+)\]\]$/;

function inCode(view: EditorView): boolean {
  const { $from } = view.state.selection;
  if ($from.parent.type.name === "codeBlock") return true;
  const code = view.state.schema.marks.code;
  return !!code && (view.state.storedMarks ?? $from.marks()).some((m) => m.type === code);
}

function charAt(view: EditorView, pos: number): string {
  return view.state.doc.textBetween(pos, pos + 1, "\n", "\n");
}

/** Converts a trailing `[[…]]` before `pos` into a wiki-link atom; returns true if it did. */
function convertWikiLink(view: EditorView, pos: number): boolean {
  const $pos = view.state.doc.resolve(pos);
  const before = $pos.parent.textBetween(0, $pos.parentOffset, "\n", "\n");
  const m = WIKI_TAIL.exec(before);
  if (!m) return false;
  const parsed = parseWikiLink(m[0]);
  const type = view.state.schema.nodes.wikiLink;
  if (!parsed || parsed.type !== "wikiLink" || !type) return false;
  const start = pos - m[0].length;
  const node = type.create({
    target: parsed.target,
    heading: parsed.heading,
    alias: parsed.alias,
    raw: parsed.raw,
  });
  view.dispatch(view.state.tr.replaceWith(start, pos, node));
  return true;
}

export const AutoPair = Extension.create({
  name: "autoPair",

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key: new PluginKey("amlAutoPair"),
        props: {
          handleTextInput(view, from, to, text) {
            if (text.length !== 1 || inCode(view)) return false;
            const closer = PAIRS[text];

            if (from !== to) {
              const mark = MARK_WRAP[text];
              if (mark) {
                if (mark === "italic") editor.chain().focus().toggleItalic().run();
                else editor.chain().focus().toggleCode().run();
                return true;
              }
              if (closer) {
                const tr = view.state.tr.insertText(closer, to).insertText(text, from);
                tr.setSelection(TextSelection.create(tr.doc, from + 1, to + 1));
                view.dispatch(tr);
                return true;
              }
              return false;
            }

            if (CLOSERS.has(text) && charAt(view, from) === text) {
              const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, from + 1));
              view.dispatch(tr);
              if (text === "]") convertWikiLink(view, from + 1);
              return true;
            }

            if (text === "]") {
              view.dispatch(view.state.tr.insertText("]", from, to));
              convertWikiLink(view, from + 1);
              return true;
            }

            if (closer) {
              const next = charAt(view, from);
              const prev = from > 0 ? charAt(view, from - 1) : "";
              const nextOk = next === "" || /[\s)\]}]/.test(next);
              const prevOk = text !== '"' || prev === "" || /[\s([{]/.test(prev);
              if (!nextOk || !prevOk) return false;
              const tr = view.state.tr.insertText(text + closer, from, to);
              tr.setSelection(TextSelection.create(tr.doc, from + 1));
              view.dispatch(tr);
              return true;
            }
            return false;
          },
          handleKeyDown(view, event) {
            if (event.key !== "Backspace" || !view.state.selection.empty || inCode(view))
              return false;
            const pos = view.state.selection.from;
            if (pos === 0) return false;
            const prev = charAt(view, pos - 1);
            const closer = PAIRS[prev];
            if (!closer || charAt(view, pos) !== closer) return false;
            view.dispatch(view.state.tr.delete(pos - 1, pos + 1));
            return true;
          },
        },
      }),
    ];
  },
});
