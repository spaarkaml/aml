/**
 * The plain-text parts of a search query, for highlighting and replace-in-note. Mirrors
 * the Rust tokenizer's shape (phrases, /regex/, `-` exclusions, fields, OR, parentheses)
 * without evaluating anything: the index is the only place a query is really run.
 */
export interface TextTerm {
  kind: "word" | "phrase" | "regex";
  value: string;
}

const FIELD = /^[A-Za-z_][A-Za-z0-9_]{0,23}:(?!\/\/)/;

export function textTermsOf(query: string): TextTerm[] {
  const out: TextTerm[] = [];
  let i = 0;
  const q = query;
  while (i < q.length) {
    const c = q[i] ?? "";
    if (/\s/.test(c) || c === "(" || c === ")") {
      i += 1;
      continue;
    }
    let negated = false;
    if (c === "-" && i + 1 < q.length && !/\s/.test(q[i + 1] ?? "")) {
      negated = true;
      i += 1;
    }
    const start = i;
    const ch = q[i] ?? "";
    if (ch === '"') {
      const end = q.indexOf('"', i + 1);
      const value = q.slice(i + 1, end === -1 ? q.length : end);
      i = end === -1 ? q.length : end + 1;
      if (!negated && value.trim()) out.push({ kind: "phrase", value });
      continue;
    }
    if (ch === "/") {
      let j = i + 1;
      let closed = false;
      while (j < q.length) {
        if (q[j] === "\\") {
          j += 2;
          continue;
        }
        if (q[j] === "/") {
          closed = true;
          break;
        }
        j += 1;
      }
      if (closed && j > i + 1) {
        const value = q.slice(i + 1, j);
        i = j + 1;
        while (i < q.length && /[A-Za-z]/.test(q[i] ?? "")) i += 1;
        if (!negated) out.push({ kind: "regex", value });
        continue;
      }
    }
    let j = start;
    while (j < q.length && !/[\s()"]/.test(q[j] ?? "")) j += 1;
    const word = q.slice(start, j);
    i = j;
    if (FIELD.test(word) && !/^\d+:/.test(word)) {
      // A field; a quoted value follows immediately after the colon.
      if (q[i] === '"') {
        const end = q.indexOf('"', i + 1);
        i = end === -1 ? q.length : end + 1;
      }
      continue;
    }
    if (word.toLowerCase() === "or" || word.toLowerCase() === "and" || !word) continue;
    if (!negated) out.push({ kind: "word", value: word });
  }
  return out;
}

/** A case-insensitive matcher for every text term, for replace-in-note. */
export function termsToRegex(terms: TextTerm[]): RegExp | null {
  const parts = terms.map((t) =>
    t.kind === "regex" ? `(?:${t.value})` : t.value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );
  if (parts.length === 0) return null;
  try {
    return new RegExp(parts.join("|"), "giu");
  } catch {
    return null;
  }
}
