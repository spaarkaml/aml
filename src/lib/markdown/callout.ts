/**
 * Obsidian callouts (WP-3.9), modelled rather than held as Raw.
 *
 * A callout is a blockquote whose first line is `[!kind]`, optionally `+`/`-` to say it folds,
 * optionally followed by a title:
 *
 *     > [!warning]- Read this first
 *     > The body, which is ordinary markdown.
 *
 * It is parsed from the blockquote's own source text rather than from its mdast children,
 * because mdast puts the title line and the first body line in one paragraph separated by a
 * soft break, and pulling them apart again is harder — and less exact — than reading the
 * lines that are already there.
 */

/** `[!kind]`, an optional fold marker, and the rest of the line as the title. */
const HEAD = /^\[!([A-Za-z][\w-]*)\]([+-])?[ \t]*(.*)$/;

export type Fold = "+" | "-" | null;

export interface CalloutSource {
  /** Lower-cased, as written in the file: `note`, `warning`, or anything else you like. */
  kind: string;
  fold: Fold;
  /** The title line as markdown; empty when the callout has none. */
  title: string;
  /** Everything after the first line, as markdown. */
  body: string;
}

/** Removes one level of `> ` quoting, the way a markdown parser does. */
export function stripQuote(source: string): string {
  return source
    .split("\n")
    .map((line) => line.replace(/^ {0,3}> ?/, ""))
    .join("\n");
}

/** Reads a blockquote's source as a callout, or null when it is an ordinary quote. */
export function parseCalloutSource(source: string): CalloutSource | null {
  const inner = stripQuote(source);
  const nl = inner.indexOf("\n");
  const first = nl === -1 ? inner : inner.slice(0, nl);
  const match = HEAD.exec(first.trim());
  if (!match) return null;
  const [, kind = "note", fold, title = ""] = match;
  return {
    kind: kind.toLowerCase(),
    fold: fold === "+" || fold === "-" ? fold : null,
    title: title.trim(),
    body: nl === -1 ? "" : inner.slice(nl + 1),
  };
}

/**
 * Back to markdown. The body goes on the lines straight after the head with no blank line
 * between, which is what makes the round trip stable: a blank `>` line there would start a
 * second paragraph, and parsing it back would give a different document from the one written.
 */
export function calloutToSource(callout: CalloutSource): string {
  const head = `[!${callout.kind}]${callout.fold ?? ""}${callout.title ? ` ${callout.title}` : ""}`;
  const body = callout.body.replace(/\n+$/, "");
  const lines = body === "" ? [head] : [head, ...body.split("\n")];
  return lines.map((line) => (line === "" ? ">" : `> ${line}`)).join("\n");
}
