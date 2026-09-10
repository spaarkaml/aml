import type { NoteIndexEntry } from "@/ipc";
import { fuzzyScore } from "@/lib/fuzzy";
import { noteTitle, parentDir } from "@/lib/paths";

export interface LinkSuggestion {
  id: string;
  /** Primary label. */
  title: string;
  /** Secondary label: folder, matched alias, or the note for a heading. */
  hint: string;
  /** Wiki target to write (stem, or path without `.md` when the stem is ambiguous). */
  target: string;
  heading: string | null;
  alias: string | null;
  /** Rows that link to a note that does not exist yet (it is created on click). */
  create: boolean;
}

export const MAX_SUGGESTIONS = 12;

/** Wiki target for a note: its file stem unless another note shares it. */
export function wikiTarget(entry: NoteIndexEntry, all: readonly NoteIndexEntry[]): string {
  const stem = noteTitle(entry.path);
  const clash = all.some(
    (e) => e !== entry && noteTitle(e.path).toLowerCase() === stem.toLowerCase(),
  );
  return clash ? entry.path.replace(/\.md$/i, "") : stem;
}

/** Suggestions for the text typed after `[[`; `Note#head` lists that note's headings. */
export function suggestLinks(query: string, entries: readonly NoteIndexEntry[]): LinkSuggestion[] {
  const hash = query.indexOf("#");
  if (hash !== -1) {
    const noteQ = query.slice(0, hash).trim();
    const headQ = query.slice(hash + 1).trim();
    const note = bestNote(noteQ, entries);
    if (!note) return [];
    const target = wikiTarget(note, entries);
    return note.headings
      .map((h) => ({ h, score: fuzzyScore(headQ, h) }))
      .filter((x): x is { h: string; score: number } => x.score !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_SUGGESTIONS)
      .map(({ h }) => ({
        id: `${note.path}#${h}`,
        title: h,
        hint: note.title,
        target,
        heading: h,
        alias: null,
        create: false,
      }));
  }
  const q = query.trim();
  const scored: Array<{ s: LinkSuggestion; score: number }> = [];
  for (const e of entries) {
    const stem = noteTitle(e.path);
    let best = fuzzyScore(q, e.title);
    let alias: string | null = null;
    const byStem = stem === e.title ? null : fuzzyScore(q, stem);
    if (byStem !== null && (best === null || byStem > best)) best = byStem;
    for (const a of e.aliases) {
      const sc = fuzzyScore(q, a);
      if (sc !== null && (best === null || sc > best + 0.5)) {
        best = sc;
        alias = a;
      }
    }
    if (best === null) continue;
    scored.push({
      s: {
        id: `${e.path}|${alias ?? ""}`,
        title: e.title,
        hint: alias ? `= ${alias}` : parentDir(e.path) || "/",
        target: wikiTarget(e, entries),
        heading: null,
        alias,
        create: false,
      },
      score: best,
    });
  }
  scored.sort((a, b) => b.score - a.score);
  const out = scored.slice(0, MAX_SUGGESTIONS).map((x) => x.s);
  const lower = q.toLowerCase();
  const exact = entries.some(
    (e) => e.title.toLowerCase() === lower || noteTitle(e.path).toLowerCase() === lower,
  );
  if (q && !exact && !/[\\:*?"<>|]/.test(q)) {
    out.push({
      id: `create:${q}`,
      title: `Link to new note “${q}”`,
      hint: "created on click",
      target: q,
      heading: null,
      alias: null,
      create: true,
    });
  }
  return out;
}

function bestNote(q: string, entries: readonly NoteIndexEntry[]): NoteIndexEntry | null {
  const lower = q.toLowerCase();
  let best: NoteIndexEntry | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const e of entries) {
    const stem = noteTitle(e.path);
    if (stem.toLowerCase() === lower || e.title.toLowerCase() === lower) return e;
    const sc = Math.max(
      fuzzyScore(q, e.title) ?? Number.NEGATIVE_INFINITY,
      fuzzyScore(q, stem) ?? Number.NEGATIVE_INFINITY,
    );
    if (sc > bestScore) {
      bestScore = sc;
      best = e;
    }
  }
  return bestScore === Number.NEGATIVE_INFINITY ? null : best;
}

/** The raw `[[…]]` text a suggestion stands for. */
export function wikiRaw(s: {
  target: string;
  heading: string | null;
  alias: string | null;
}): string {
  return `[[${s.target}${s.heading ? `#${s.heading}` : ""}${s.alias ? `|${s.alias}` : ""}]]`;
}
