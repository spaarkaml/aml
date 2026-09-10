/**
 * The heading structure of the open note, derived from the live ProseMirror document
 * (never from the index — the outline must follow unsaved edits).
 *
 * Headings are always top-level in the AML schema, so a "section" is a heading plus every
 * top-level node after it, up to the next heading of the same or a higher level.
 */

/** The parts of a ProseMirror node this module reads. Structural, so tests need no editor. */
export interface NodeLike {
  type: { name: string };
  attrs: Record<string, unknown>;
  textContent: string;
}

export interface DocLike {
  forEach(f: (node: NodeLike, offset: number, index: number) => void): void;
  content: { size: number };
}

export interface OutlineHeading {
  /** Position in the flat list; the panel and the move commands address headings by it. */
  index: number;
  /** The level as written (1–6). */
  level: number;
  /** Display depth with skipped levels collapsed, so an H1 → H3 jump indents once. */
  depth: number;
  text: string;
  /** Document position before the heading node. */
  pos: number;
  /** End of the heading's section (exclusive). */
  end: number;
}

export function outlineOf(doc: DocLike): OutlineHeading[] {
  const raw: Array<{ level: number; text: string; pos: number }> = [];
  doc.forEach((node, offset) => {
    if (node.type.name !== "heading") return;
    const level = Math.min(6, Math.max(1, Number(node.attrs.level) || 1));
    raw.push({ level, text: node.textContent.trim(), pos: offset });
  });
  const stack: number[] = [];
  return raw.map((h, index) => {
    const next = raw.findIndex((o, j) => j > index && o.level <= h.level);
    while (stack.length > 0 && (stack[stack.length - 1] ?? 0) >= h.level) stack.pop();
    const depth = stack.length;
    stack.push(h.level);
    return { ...h, index, depth, end: next === -1 ? doc.content.size : (raw[next]?.pos ?? 0) };
  });
}

/** The heading whose section holds `caret`, or -1 when the caret sits above them all. */
export function activeIndex(headings: OutlineHeading[], caret: number): number {
  let active = -1;
  for (const h of headings) {
    if (h.pos > caret) break;
    active = h.index;
  }
  return active;
}

export interface SectionMove {
  /** Document range of the section being moved. */
  from: number;
  to: number;
  /** Where it should land, in positions *before* the move is applied. */
  insert: number;
}

/**
 * Plans a drag of the section at `source` to sit immediately before the heading at `target`
 * (`target === headings.length` means "after everything"). Returns null when the move would
 * put a section inside itself or leave the document unchanged.
 */
export function planMove(
  headings: OutlineHeading[],
  source: number,
  target: number,
  docSize: number,
): SectionMove | null {
  const s = headings[source];
  if (!s) return null;
  const insert = target >= headings.length ? docSize : (headings[target]?.pos ?? null);
  if (insert === null) return null;
  if (insert >= s.pos && insert <= s.end) return null;
  return { from: s.pos, to: s.end, insert };
}

/** The target index that moves the section at `index` one place up or down among its peers. */
export function stepTarget(
  headings: OutlineHeading[],
  index: number,
  direction: -1 | 1,
): number | null {
  const h = headings[index];
  if (!h) return null;
  if (direction === -1) {
    // The previous heading at this depth or shallower: swap with the section before us.
    for (let i = index - 1; i >= 0; i--) {
      const o = headings[i];
      if (o && o.level <= h.level) return i;
    }
    return null;
  }
  // Down: land before the heading that follows the next sibling's section.
  const next = headings.findIndex((o, j) => j > index && o.level <= h.level);
  if (next === -1) return null;
  const after = headings.findIndex((o, j) => j > next && o.level <= (headings[next]?.level ?? 1));
  return after === -1 ? headings.length : after;
}
