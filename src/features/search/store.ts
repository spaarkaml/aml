import { create } from "zustand";
import { getActiveEditor } from "@/features/editor/editorRef";
import { useLayoutStore } from "@/features/layout/store";
import { commands, type SearchResult } from "@/ipc";
import { termsToRegex, textTermsOf } from "./terms";

export const SEARCH_DEBOUNCE_MS = 150;
export const SEARCH_LIMIT = 200;

interface SearchState {
  query: string;
  /** The query the current `results` belong to; lags `query` while typing. */
  settled: string;
  results: SearchResult[];
  total: number;
  error: string | null;
  loading: boolean;
  /** Bumped when the panel should take keyboard focus. */
  focusRequest: number;
  setQuery: (q: string) => void;
  /** Runs the current query now (debounced typing goes through `setQuery`). */
  run: () => Promise<void>;
  clear: () => void;
  /** Opens the left panel on Search and focuses the field. */
  show: (query?: string) => void;
  /** Replaces every text-term match in the open note; returns the number replaced. */
  replaceInNote: (replacement: string) => number;
}

let timer: ReturnType<typeof setTimeout> | null = null;
let generation = 0;

export const useSearchStore = create<SearchState>((set, get) => ({
  query: "",
  settled: "",
  results: [],
  total: 0,
  error: null,
  loading: false,
  focusRequest: 0,

  setQuery: (query) => {
    set({ query });
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void get().run();
    }, SEARCH_DEBOUNCE_MS);
  },

  run: async () => {
    const query = get().query;
    const gen = ++generation;
    if (!query.trim()) {
      set({ settled: query, results: [], total: 0, error: null, loading: false });
      return;
    }
    set({ loading: true });
    const r = await commands.searchQuery(query, SEARCH_LIMIT);
    if (gen !== generation) return;
    if (r.status !== "ok") {
      set({
        settled: query,
        loading: false,
        error: r.error.kind === "noFolioOpen" ? "Open a Folio first." : null,
      });
      return;
    }
    set({
      settled: query,
      results: r.data.results,
      total: r.data.total,
      error: r.data.error,
      loading: false,
    });
  },

  clear: () => {
    if (timer) clearTimeout(timer);
    timer = null;
    generation += 1;
    set({ query: "", settled: "", results: [], total: 0, error: null, loading: false });
  },

  show: (query) => {
    if (query !== undefined) get().setQuery(query);
    useLayoutStore.getState().setLeftView("search");
    useLayoutStore.getState().openPanel("left");
    set((s) => ({ focusRequest: s.focusRequest + 1 }));
  },

  replaceInNote: (replacement) => {
    const editor = getActiveEditor();
    const re = termsToRegex(textTermsOf(get().query));
    if (!editor || !re) return 0;
    const { doc, tr } = editor.state;
    const hits: Array<{ from: number; to: number }> = [];
    doc.descendants((node, pos) => {
      if (!node.isText || !node.text) return true;
      // Code stays verbatim, like everywhere else in AML.
      if (node.marks.some((m) => m.type.name === "code")) return true;
      re.lastIndex = 0;
      for (const m of node.text.matchAll(re)) {
        if (m[0].length === 0) continue;
        hits.push({ from: pos + m.index, to: pos + m.index + m[0].length });
      }
      return true;
    });
    // Apply from the end so earlier positions stay valid.
    for (const h of [...hits].reverse()) tr.insertText(replacement, h.from, h.to);
    if (hits.length) editor.view.dispatch(tr);
    return hits.length;
  },
}));
