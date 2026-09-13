/**
 * Comparing and combining the two sides of a sync conflict (WP-4.2).
 *
 * Markdown keeps a paragraph on one line, so a line diff *is* a paragraph diff — which is the
 * unit a writer chooses between. Within a changed paragraph the words that differ are marked,
 * because two versions of the same sentence are unreadable side by side otherwise.
 *
 * There is no common ancestor to diff against (no Snapshots yet, WP-4.1), so this is a
 * two-way comparison and says only *where* the sides differ, never who changed what. The
 * choice at each difference is the writer's, and nothing is chosen for them that loses text
 * they have not looked at.
 */

export type Op<T> =
  | { kind: "same"; a: T; b: T }
  | { kind: "removed"; a: T }
  | { kind: "added"; b: T };

/** Past this many cells the middle of a diff is shown as one change rather than computed. */
const MAX_CELLS = 4_000_000;

/**
 * Longest-common-subsequence diff with the shared head and tail trimmed first. Conflicts are
 * almost always a few paragraphs in a long note, so the table is built for the part that
 * differs, not for the whole file.
 */
export function diff<T>(a: T[], b: T[], eq: (x: T, y: T) => boolean = Object.is): Op<T>[] {
  let start = 0;
  while (start < a.length && start < b.length && eq(a[start] as T, b[start] as T)) start += 1;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && eq(a[endA - 1] as T, b[endB - 1] as T)) {
    endA -= 1;
    endB -= 1;
  }

  const head: Op<T>[] = a.slice(0, start).map((x, i) => ({ kind: "same", a: x, b: b[i] as T }));
  const tail: Op<T>[] = a.slice(endA).map((x, i) => ({ kind: "same", a: x, b: b[endB + i] as T }));
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);

  let middle: Op<T>[];
  if (midA.length === 0 || midB.length === 0 || midA.length * midB.length > MAX_CELLS) {
    middle = [
      ...midA.map((x): Op<T> => ({ kind: "removed", a: x })),
      ...midB.map((y): Op<T> => ({ kind: "added", b: y })),
    ];
  } else {
    middle = lcs(midA, midB, eq);
  }
  return [...head, ...middle, ...tail];
}

function lcs<T>(a: T[], b: T[], eq: (x: T, y: T) => boolean): Op<T>[] {
  const n = a.length;
  const m = b.length;
  const width = m + 1;
  const table = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i * width + j] = eq(a[i] as T, b[j] as T)
        ? (table[(i + 1) * width + j + 1] ?? 0) + 1
        : Math.max(table[(i + 1) * width + j] ?? 0, table[i * width + j + 1] ?? 0);
    }
  }
  const out: Op<T>[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (eq(a[i] as T, b[j] as T)) {
      out.push({ kind: "same", a: a[i] as T, b: b[j] as T });
      i += 1;
      j += 1;
    } else if ((table[(i + 1) * width + j] ?? 0) >= (table[i * width + j + 1] ?? 0)) {
      out.push({ kind: "removed", a: a[i] as T });
      i += 1;
    } else {
      out.push({ kind: "added", b: b[j] as T });
      j += 1;
    }
  }
  while (i < n) out.push({ kind: "removed", a: a[i++] as T });
  while (j < m) out.push({ kind: "added", b: b[j++] as T });
  return out;
}

/** A stretch both sides share, or a place where they differ. */
export type Hunk =
  | { kind: "same"; lines: string[] }
  | { kind: "change"; id: number; original: string[]; copy: string[] };

/** What to keep at one difference. */
export type Choice = "original" | "copy" | "both";

export function lines(text: string): string[] {
  return text.replace(/\r\n/g, "\n").split("\n");
}

export function hunks(original: string, copy: string): Hunk[] {
  const out: Hunk[] = [];
  let id = 0;
  for (const op of diff(lines(original), lines(copy))) {
    const last = out[out.length - 1];
    if (op.kind === "same") {
      if (last?.kind === "same") last.lines.push(op.a);
      else out.push({ kind: "same", lines: [op.a] });
      continue;
    }
    const change =
      last?.kind === "change"
        ? last
        : { kind: "change" as const, id: id++, original: [], copy: [] };
    if (change !== last) out.push(change);
    if (op.kind === "removed") change.original.push(op.a);
    else change.copy.push(op.b);
  }
  return out;
}

export function changes(list: Hunk[]): Extract<Hunk, { kind: "change" }>[] {
  return list.filter((h): h is Extract<Hunk, { kind: "change" }> => h.kind === "change");
}

/**
 * The text a set of choices produces.
 *
 * "Both" keeps the version in place and then whatever the copy adds that it does not already
 * say. In a note the two are kept as separate paragraphs — run together on consecutive lines,
 * markdown would quietly fuse them into one.
 */
export function compose(
  list: Hunk[],
  choices: Map<number, Choice>,
  fallback: Choice,
  kind: "note" | "settings",
): string {
  const out: string[] = [];
  for (const h of list) {
    if (h.kind === "same") {
      out.push(...h.lines);
      continue;
    }
    const choice = choices.get(h.id) ?? fallback;
    if (choice === "original") out.push(...h.original);
    else if (choice === "copy") out.push(...h.copy);
    else {
      const kept = new Set(h.original);
      const added = h.copy.filter((l) => !kept.has(l));
      out.push(...h.original);
      const needsGap =
        kind === "note" &&
        h.original.length > 0 &&
        added.length > 0 &&
        (h.original[h.original.length - 1] ?? "").trim() !== "" &&
        (added[0] ?? "").trim() !== "";
      if (needsGap) out.push("");
      out.push(...added);
    }
  }
  return out.join("\n");
}

export type Segment = { text: string; kind: "same" | "removed" | "added" };

/** Word-level marks for one changed paragraph: what only the original says, what only the copy says. */
export function words(original: string, copy: string): { original: Segment[]; copy: Segment[] } {
  const split = (s: string) => s.split(/(\s+)/).filter((t) => t !== "");
  const ops = diff(split(original), split(copy));
  const left: Segment[] = [];
  const right: Segment[] = [];
  const push = (list: Segment[], text: string, kind: Segment["kind"]) => {
    const last = list[list.length - 1];
    if (last && last.kind === kind) last.text += text;
    else list.push({ text, kind });
  };
  for (const op of ops) {
    if (op.kind === "same") {
      push(left, op.a, "same");
      push(right, op.b, "same");
    } else if (op.kind === "removed") push(left, op.a, "removed");
    else push(right, op.b, "added");
  }
  return { original: left, copy: right };
}
