/**
 * Sentence boundaries for Focus Mode's sentence setting (WP-3.1).
 *
 * This is deliberately a reading aid, not a parser: a sentence ends on `.`, `!`, `?` or `…`
 * followed by whitespace, unless the word in front is an abbreviation or a single letter — so
 * decimals, file names, "e.g." and "p. 41" stay in one piece. Getting an unusual sentence
 * slightly wrong dims a few words oddly; it never touches the text, so the cost of being
 * simple here is a dimmer that occasionally over-reaches.
 */

const TERMINATORS = new Set([".", "!", "?", "…"]);
const CLOSERS = new Set(['"', "'", ")", "]", "}", "»", "”", "’"]);

/** Words that end in a full stop without ending a sentence — an academic Folio is full of them. */
const ABBREVIATIONS = new Set([
  "mr",
  "mrs",
  "ms",
  "dr",
  "prof",
  "st",
  "vs",
  "cf",
  "ed",
  "eds",
  "etc",
  "al",
  "fig",
  "figs",
  "vol",
  "vols",
  "no",
  "nos",
  "ch",
  "chap",
  "pp",
  "trans",
  "repr",
  "jan",
  "feb",
  "mar",
  "apr",
  "jun",
  "jul",
  "aug",
  "sep",
  "sept",
  "oct",
  "nov",
  "dec",
]);

/** The word immediately before `end`, as written. */
function wordBefore(text: string, end: number): string {
  let start = end;
  while (start > 0 && /[\p{L}\p{N}.]/u.test(text[start - 1] ?? "")) start -= 1;
  return text.slice(start, end);
}

/**
 * True when a full stop after `word` is part of the word rather than the end of a sentence:
 * a single letter ("p. 41"), a known abbreviation ("Fig. 2"), or anything already carrying an
 * internal dot, which is what makes "e.g." and "U.S." initialisms. The last rule also means a
 * sentence that genuinely ends in "U.S." runs on into the next one — a dimmer that reaches too
 * far now and then, which is the right way for this to be wrong.
 */
function isAbbreviation(word: string): boolean {
  if (word.length === 1) return true;
  if (word.includes(".")) return true;
  return ABBREVIATIONS.has(word.toLowerCase());
}

/** End offsets of each sentence in `text` (exclusive), always ending with `text.length`. */
export function sentenceEnds(text: string): number[] {
  const ends: number[] = [];
  let i = 0;
  while (i < text.length) {
    if (TERMINATORS.has(text[i] ?? "")) {
      let j = i;
      while (j < text.length && TERMINATORS.has(text[j] ?? "")) j += 1;
      while (j < text.length && CLOSERS.has(text[j] ?? "")) j += 1;
      // A terminator only ends a sentence when what follows is a gap ("3.5" stays whole) and
      // the word in front of it is not an abbreviation ("e.g.", "p. 41", "Fig. 2").
      const abbreviated = isAbbreviation(wordBefore(text, i));
      if (!abbreviated && (j >= text.length || /\s/.test(text[j] ?? ""))) {
        ends.push(j);
        i = j;
        continue;
      }
      i = j;
      continue;
    }
    i += 1;
  }
  if (ends[ends.length - 1] !== text.length) ends.push(text.length);
  return ends;
}

/**
 * The sentence around `offset`, as `[start, end)` with surrounding whitespace left out. A caret
 * sitting on the space between two sentences belongs to the one that follows it.
 */
export function sentenceAt(text: string, offset: number): [number, number] {
  if (text.length === 0) return [0, 0];
  const at = Math.max(0, Math.min(offset, text.length));
  const ends = sentenceEnds(text);
  let start = 0;
  for (const end of ends) {
    if (at <= end) {
      // Trim the gap in front of the sentence so the dimming lines up with the words.
      let from = start;
      while (from < end && /\s/.test(text[from] ?? "")) from += 1;
      return [from, end];
    }
    start = end;
  }
  return [start, text.length];
}
