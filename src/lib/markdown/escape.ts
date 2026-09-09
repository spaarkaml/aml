/**
 * Conservative text escaping for canonical markdown output.
 * remark's default escaper writes `snake\_case` and `\[not a link]`; ours escapes only where
 * CommonMark/GFM could actually start a construct. `escape.test.ts` proves every case
 * round-trips through the real parser.
 */

const ASCII_PUNCT = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;

function isWhitespace(ch: string): boolean {
  return ch === "" || /\s/.test(ch);
}

function isPunct(ch: string): boolean {
  return ch !== "" && (ASCII_PUNCT.test(ch) || /\p{P}|\p{S}/u.test(ch));
}

/** CommonMark left/right-flanking test for a delimiter run at [i, j). */
function flanking(text: string, i: number, j: number, before: string, after: string) {
  const prev = i === 0 ? before : (text[i - 1] ?? "");
  const next = j >= text.length ? after : (text[j] ?? "");
  const left = !isWhitespace(next) && (!isPunct(next) || isWhitespace(prev) || isPunct(prev));
  const right = !isWhitespace(prev) && (!isPunct(prev) || isWhitespace(next) || isPunct(next));
  return { left, right, prev, next };
}

export interface EscapeContext {
  /** Character before this text in the output ("" or "\n" means start of line). */
  before: string;
  /** Character after this text in the output. */
  after: string;
  inTable: boolean;
}

export function escapeText(text: string, ctx: EscapeContext): string {
  let out = "";
  let i = 0;
  let atLineStart = ctx.before === "" || ctx.before === "\n";

  while (i < text.length) {
    const ch = text[i] ?? "";

    if (atLineStart) {
      const rest = text.slice(i);
      // Block starters: heading, quote, list, hr, table, fences, setext underline, html
      const m =
        /^(#{1,6})(?=\s|$)/.exec(rest) ??
        /^(>)/.exec(rest) ??
        /^([-+*])(?=\s|$)/.exec(rest) ??
        /^(\d{1,9})(?=[.)](?:\s|$))/.exec(rest) ??
        /^(\|)/.exec(rest) ??
        /^(`{3,}|~{3,})/.exec(rest) ??
        /^([=-]{1,})\s*$/m.exec(rest) ??
        /^([-*_])(?:[ \t]*\1){2,}[ \t]*$/m.exec(rest) ??
        /^(\s{4,})/.exec(rest);
      if (m) {
        const token = m[1] ?? "";
        if (/^\d+$/.test(token)) {
          // "1. x" → "1\. x": escape the delimiter after the number
          out += `${token}\\`;
          i += token.length;
          atLineStart = false;
          continue;
        }
        if (/^\s+$/.test(token)) {
          out += token.replace(/ {4}/, "&#32;   ");
          i += token.length;
          atLineStart = false;
          continue;
        }
        out += `\\${token[0]}${token.slice(1)}`;
        i += token.length;
        atLineStart = false;
        continue;
      }
      atLineStart = false;
    }

    if (ch === "\n") {
      out += ch;
      i += 1;
      atLineStart = true;
      continue;
    }

    if (ch === "*" || ch === "_") {
      let j = i;
      while (text[j] === ch) j += 1;
      const { left, right, prev, next } = flanking(text, i, j, ctx.before, ctx.after);
      const intraword = ch === "_" && /[\p{L}\p{N}]/u.test(prev) && /[\p{L}\p{N}]/u.test(next);
      const dangerous = (left || right) && !intraword;
      out += dangerous ? `\\${ch}`.repeat(j - i) : ch.repeat(j - i);
      i = j;
      continue;
    }

    if (ch === "~" && text[i + 1] === "~") {
      out += "\\~\\~";
      i += 2;
      continue;
    }
    if (ch === "`") {
      out += "\\`";
      i += 1;
      continue;
    }
    if (ch === "[") {
      out += "\\[";
      i += 1;
      continue;
    }
    if (ch === "]" && (text[i + 1] === "(" || text[i + 1] === "[" || text[i + 1] === ":")) {
      out += "\\]";
      i += 1;
      continue;
    }
    if (ch === "\\") {
      const next = text[i + 1] ?? "";
      out += next !== "" && ASCII_PUNCT.test(next) ? "\\\\" : "\\";
      i += 1;
      continue;
    }
    if (ch === "<" && /[a-zA-Z/!?]/.test(text[i + 1] ?? "")) {
      out += "\\<";
      i += 1;
      continue;
    }
    if (ch === "&" && /^&#?[a-zA-Z0-9]+;/.test(text.slice(i))) {
      out += "\\&";
      i += 1;
      continue;
    }
    if (ch === "$") {
      out += "\\$";
      i += 1;
      continue;
    }
    if (ch === "!" && text[i + 1] === "[") {
      out += "\\!";
      i += 1;
      continue;
    }
    if (ch === "|" && ctx.inTable) {
      out += "\\|";
      i += 1;
      continue;
    }
    if (ch === " " && i === text.length - 1 && (ctx.after === "\n" || ctx.after === "")) {
      // trailing space at end of line would be stripped or read as a break
      out += "&#32;";
      i += 1;
      continue;
    }
    if (
      ch === " " &&
      text[i + 1] === " " &&
      (text[i + 2] === "\n" || (i + 2 >= text.length && ctx.after === "\n"))
    ) {
      out += "&#32;";
      i += 1;
      continue;
    }

    out += ch;
    i += 1;
  }
  return out;
}
