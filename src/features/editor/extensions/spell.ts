import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { useSpellStore } from "@/features/spell/store";
import { collectWords } from "@/features/spell/tokenise";
import { commands } from "@/ipc";

export const SPELL_KEY = new PluginKey<DecorationSet>("amlSpell");
export const SPELL_DEBOUNCE_MS = 400;

/** Words already judged by Rust; cleared when the personal or ignore lists change. */
const known = new Map<string, boolean>();

export function forgetWord(word: string): void {
  known.delete(word);
  known.delete(word.toLowerCase());
}

export function forgetAll(): void {
  known.clear();
}

/**
 * Underlines misspelled words (ADR-009). On each document change (debounced) the plugin
 * collects checkable words, asks Rust about the ones it has not seen, and rebuilds the
 * decoration set. Decorations are mapped through edits in between so they never drift.
 */
export const SpellCheck = Extension.create({
  name: "spellCheck",

  addProseMirrorPlugins() {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let generation = 0;
    let pendingRecheck = false;

    const run = async (view: EditorView) => {
      const gen = ++generation;
      if (!useSpellStore.getState().enabled) {
        view.dispatch(view.state.tr.setMeta(SPELL_KEY, DecorationSet.empty));
        return;
      }
      const spans = collectWords(view.state.doc);
      const unknown = [...new Set(spans.map((s) => s.word).filter((w) => !known.has(w)))];
      if (unknown.length > 0) {
        const r = await commands.spellCheck(unknown);
        if (r.status !== "ok") return;
        const bad = new Set(r.data);
        for (const w of unknown) known.set(w, !bad.has(w));
      }
      if (gen !== generation || view.isDestroyed) return;
      // Positions were taken from the doc at collection time; if it changed meanwhile the
      // next run (already scheduled by that change) will redo them.
      const decos = spans
        .filter((s) => known.get(s.word) === false)
        .map((s) =>
          Decoration.inline(s.from, s.to, {
            class: "aml-misspelled",
            "data-word": s.word,
            spellcheck: "false",
          }),
        );
      view.dispatch(view.state.tr.setMeta(SPELL_KEY, DecorationSet.create(view.state.doc, decos)));
    };

    const schedule = (view: EditorView) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void run(view);
      }, SPELL_DEBOUNCE_MS);
    };

    return [
      new Plugin<DecorationSet>({
        key: SPELL_KEY,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, set) {
            const next = tr.getMeta(SPELL_KEY) as DecorationSet | undefined;
            if (next) return next;
            if (tr.getMeta("amlSpellRecheck")) pendingRecheck = true;
            return tr.docChanged ? set.map(tr.mapping, tr.doc) : set;
          },
        },
        props: {
          decorations(state) {
            return SPELL_KEY.getState(state) ?? DecorationSet.empty;
          },
          handleDOMEvents: {
            contextmenu(view, event) {
              const el = (event.target as HTMLElement | null)?.closest?.(".aml-misspelled");
              if (!(el instanceof HTMLElement)) return false;
              const pos = view.posAtDOM(el, 0);
              const set = SPELL_KEY.getState(view.state);
              const hit = set?.find(pos, pos + 1)[0];
              if (!hit) return false;
              event.preventDefault();
              useSpellStore.getState().openMenu({
                word: String(el.dataset.word ?? view.state.doc.textBetween(hit.from, hit.to)),
                from: hit.from,
                to: hit.to,
                x: event.clientX,
                y: event.clientY,
              });
              return true;
            },
          },
        },
        view(view) {
          schedule(view);
          const unsub = useSpellStore.subscribe((s, prev) => {
            if (s.enabled !== prev.enabled) schedule(view);
          });
          return {
            update(v, prevState) {
              if (v.state.doc !== prevState.doc || pendingRecheck) {
                pendingRecheck = false;
                schedule(v);
              }
            },
            destroy() {
              if (timer) clearTimeout(timer);
              timer = null;
              generation++;
              unsub();
            },
          };
        },
      }),
    ];
  },
});

/** Re-checks the open editor (after add-to-dictionary / ignore). */
export function recheck(view: EditorView): void {
  view.dispatch(view.state.tr.setMeta("amlSpellRecheck", true));
}
