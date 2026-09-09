import type { NoteIndexEntry } from "@/ipc";
import { fuzzyScore } from "@/lib/fuzzy";
import { parentDir } from "@/lib/paths";

export type MatchKind = "title" | "alias" | "heading" | "path" | "recent";

export interface NoteMatch {
  path: string;
  title: string;
  /** What the query matched; decides the secondary label. */
  kind: MatchKind;
  /** Alias or heading text that matched (for display and, for headings, to jump to). */
  detail: string | null;
  score: number;
}

export const MAX_RESULTS = 40;

/**
 * Ranks notes for Quick Open. Titles outrank aliases, which outrank headings, which outrank
 * bare path matches; a note appears once, under its best match. An empty query lists
 * `recents` (most recent first) followed by the rest by title.
 */
export function searchNotes(
  query: string,
  entries: readonly NoteIndexEntry[],
  recents: readonly string[] = [],
): NoteMatch[] {
  const q = query.trim();
  if (!q) {
    const byPath = new Map(entries.map((e) => [e.path, e]));
    const out: NoteMatch[] = [];
    for (const p of recents) {
      const e = byPath.get(p);
      if (e) out.push({ path: e.path, title: e.title, kind: "recent", detail: null, score: 0 });
    }
    const seen = new Set(out.map((m) => m.path));
    const rest = entries
      .filter((e) => !seen.has(e.path))
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((e) => ({
        path: e.path,
        title: e.title,
        kind: "title" as const,
        detail: null,
        score: 0,
      }));
    return [...out, ...rest].slice(0, MAX_RESULTS);
  }

  const recentRank = new Map(recents.map((p, i) => [p, recents.length - i]));
  const results: NoteMatch[] = [];
  for (const e of entries) {
    let best: NoteMatch | null = null;
    const consider = (kind: MatchKind, target: string, weight: number, detail: string | null) => {
      const s = fuzzyScore(q, target);
      if (s === null) return;
      const score = s * weight + (recentRank.get(e.path) ?? 0) * 0.05;
      if (!best || score > best.score) best = { path: e.path, title: e.title, kind, detail, score };
    };
    consider("title", e.title, 3, null);
    for (const a of e.aliases) consider("alias", a, 2.5, a);
    for (const h of e.headings) consider("heading", h, 1.5, h);
    consider("path", e.path, 1, parentDir(e.path) || null);
    if (best) results.push(best);
  }
  results.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  return results.slice(0, MAX_RESULTS);
}

/** True when some note's title (or alias) equals the query, ignoring case. */
export function hasExactTitle(query: string, entries: readonly NoteIndexEntry[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return entries.some(
    (e) => e.title.toLowerCase() === q || e.aliases.some((a) => a.toLowerCase() === q),
  );
}
