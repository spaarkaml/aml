/**
 * Subsequence fuzzy matcher used by Quick Open and the Command Palette.
 * Returns null when `query` is not a subsequence of `target`, otherwise a score
 * where higher is better: consecutive matches and word-start matches score more,
 * shorter targets win ties.
 */
export function fuzzyScore(query: string, target: string): number | null {
  const q = query.trim().toLowerCase();
  const t = target.toLowerCase();
  if (q.length === 0) return 0;
  let qi = 0;
  let score = 0;
  let prev = -2;
  for (let ti = 0; ti < t.length && qi < q.length; ti += 1) {
    if (t[ti] !== q[qi]) continue;
    score += 1;
    if (prev === ti - 1) score += 2;
    const before = ti === 0 ? " " : (t[ti - 1] ?? " ");
    if (/[\s\-_/.:]/.test(before)) score += 3;
    prev = ti;
    qi += 1;
  }
  if (qi < q.length) return null;
  return score - t.length * 0.01;
}

export function fuzzyFilter<T>(query: string, items: readonly T[], key: (item: T) => string): T[] {
  const scored: Array<{ item: T; score: number }> = [];
  for (const item of items) {
    const score = fuzzyScore(query, key(item));
    if (score !== null) scored.push({ item, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.item);
}
