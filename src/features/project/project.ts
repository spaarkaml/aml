import type { BinderItem, Project } from "@/ipc";

/**
 * Everything the Binder, the Corkboard and the dashboard work out from a Project, kept apart
 * from the components so every number on screen has a test (WP-5.1 – 5.3, 5.8).
 *
 * A Project's shape is the folder's: a part is a folder, a document is a note. The manifest
 * only ever says what order they are in and what a compile leaves out, so everything here is
 * derived from the Binder that Rust has already reconciled against the disk.
 */

/**
 * Card colours: the Bounding palette (ADR-010) and eight more in the same register.
 *
 * Six was too few. A manuscript with five statuses had better-than-even odds of two of them
 * landing on the same colour, and a key with one colour against two words is worse than no
 * colour at all. These are spaced around the wheel and kept to a middle lightness so each one
 * reads as itself on the page and in Ink.
 */
export const CARD_COLOURS = [
  "#006078", // teal — AML's own
  "#e37c78", // salmon
  "#7a5c9e", // purple
  "#4c8b5a", // green
  "#c08a2e", // amber
  "#2f6fb3", // blue
  "#b0447a", // magenta
  "#3f9b8e", // sea green
  "#b5562f", // rust
  "#7d8b2f", // olive
  "#82bac4", // pale cyan
  "#6d7b8c", // slate
] as const;

/** Where a value starts looking for a colour. Stable for ever: it is only its own letters. */
function colourIndex(value: string): number {
  let hash = 0;
  for (const ch of value) hash = (hash * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return hash % CARD_COLOURS.length;
}

/**
 * A stable colour for a free-text label or status, chosen by the word alone.
 *
 * Use `colourScale` wherever the whole set of values is known — this one cannot see the other
 * values, so it cannot promise that two of them differ.
 */
export function cardColour(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  return CARD_COLOURS[colourIndex(v)] ?? null;
}

/**
 * Colours for a whole set of values, with no two the same while the palette lasts.
 *
 * Each value starts at the colour its own letters choose — so a word usually keeps the colour
 * it has always had — and takes the next free one if that is spoken for. Values are sorted
 * first, so the answer depends on *which* words are in the Project and never on the order the
 * documents happen to be in: the same Project gives the same key on both machines.
 */
export function colourScale(values: Iterable<string>): Map<string, string> {
  const unique = [...new Set([...values].map((v) => v.trim()).filter((v) => v.length > 0))].sort(
    (a, b) => a.localeCompare(b),
  );
  const taken = new Set<string>();
  const scale = new Map<string, string>();
  for (const value of unique) {
    const start = colourIndex(value.toLowerCase());
    let chosen = CARD_COLOURS[start] as string;
    for (let step = 0; step < CARD_COLOURS.length; step++) {
      const candidate = CARD_COLOURS[(start + step) % CARD_COLOURS.length] as string;
      if (!taken.has(candidate)) {
        chosen = candidate;
        break;
      }
    }
    // More values than colours: the extras go back to sharing, which is still better than
    // refusing to colour them at all.
    taken.add(chosen);
    scale.set(value, chosen);
  }
  return scale;
}

export function parentRel(rel: string): string {
  const i = rel.lastIndexOf("/");
  return i === -1 ? "" : rel.slice(0, i);
}

export function isWithinRel(rel: string, ancestor: string): boolean {
  return ancestor !== "" && (rel === ancestor || rel.startsWith(`${ancestor}/`));
}

export interface Group {
  /** The part this group is under, or null for documents at the top of the Project. */
  part: BinderItem | null;
  items: BinderItem[];
  words: number;
}

/**
 * The Binder as parts with their documents. A part's group holds every document under it,
 * however deeply — a sub-part is still that part's words.
 */
export function groupsOf(project: Project | null): Group[] {
  if (!project) return [];
  const groups: Group[] = [];
  let current: Group | null = null;
  for (const item of project.binder) {
    if (item.kind === "folder" && item.depth === 0) {
      current = { part: item, items: [], words: 0 };
      groups.push(current);
      continue;
    }
    if (item.depth === 0) {
      // A document at the top of the Project belongs to no part.
      if (!current || current.part !== null) {
        current = { part: null, items: [], words: 0 };
        groups.push(current);
      }
    }
    if (item.kind !== "note") continue;
    if (!current) {
      current = { part: null, items: [], words: 0 };
      groups.push(current);
    }
    current.items.push(item);
    current.words += item.words;
  }
  return groups;
}

export interface ProjectStats {
  documents: number;
  parts: number;
  words: number;
  /** Words in the documents a compile would include. */
  includedWords: number;
  excluded: number;
}

export function statsOf(project: Project | null): ProjectStats {
  const stats: ProjectStats = { documents: 0, parts: 0, words: 0, includedWords: 0, excluded: 0 };
  for (const item of project?.binder ?? []) {
    if (item.kind === "folder") {
      stats.parts += 1;
      continue;
    }
    if (item.kind !== "note") continue;
    stats.documents += 1;
    stats.words += item.words;
    if (item.include) stats.includedWords += item.words;
    else stats.excluded += 1;
  }
  return stats;
}

export interface StatusCount {
  status: string;
  documents: number;
  words: number;
}

/** Documents by status, most words first; the ones with no status last, as "No status". */
export function statusesOf(project: Project | null): StatusCount[] {
  const by = new Map<string, StatusCount>();
  for (const item of project?.binder ?? []) {
    if (item.kind !== "note") continue;
    const status = item.status.trim();
    const row = by.get(status) ?? { status, documents: 0, words: 0 };
    row.documents += 1;
    row.words += item.words;
    by.set(status, row);
  }
  return [...by.values()].sort((a, b) =>
    a.status === ""
      ? 1
      : b.status === ""
        ? -1
        : b.words - a.words || a.status.localeCompare(b.status),
  );
}

export interface DropPlan {
  /** Folio-relative move, when the item changes parent. */
  move: { from: string; to: string } | null;
  /** The whole Binder, project-relative, in its new order. */
  order: string[];
}

/**
 * What dropping `from` above or below `to` means. Reordering inside a part is a manifest
 * change; dragging into another part is a file move as well, because the Binder's structure
 * *is* the folder's — there is no second truth to keep in step.
 * Null when the drop would do nothing, or would put a part inside itself.
 */
export function dropPlan(
  project: Project,
  from: string,
  to: string,
  before: boolean,
): DropPlan | null {
  if (from === to || isWithinRel(to, from)) return null;
  const source = project.binder.find((i) => i.rel === from);
  const target = project.binder.find((i) => i.rel === to);
  if (!source || !target) return null;

  const parent = parentRel(to);
  const moves = parentRel(from) !== parent;
  const name = from.slice(from.lastIndexOf("/") + 1);
  const rel = moves ? (parent ? `${parent}/${name}` : name) : from;
  if (moves && project.binder.some((i) => i.rel === rel)) return null; // name already taken

  const order = project.binder.map((i) => i.rel).filter((r) => r !== from && !isWithinRel(r, from));
  const at = order.indexOf(to);
  if (at === -1) return null;
  order.splice(before ? at : at + 1, 0, rel);

  return {
    move: moves ? { from: source.path, to: `${project.path}/${rel}` } : null,
    order,
  };
}

/**
 * What dropping `from` onto the part `folder` means: the file moves into it and takes its
 * place at the end of it. A part cannot be dropped into itself or into its own children.
 */
export function nestPlan(project: Project, from: string, folder: string): DropPlan | null {
  if (from === folder || isWithinRel(folder, from)) return null;
  const source = project.binder.find((i) => i.rel === from);
  const part = project.binder.find((i) => i.rel === folder && i.kind === "folder");
  if (!source || !part) return null;
  if (parentRel(from) === folder) return null;

  const name = from.slice(from.lastIndexOf("/") + 1);
  const rel = `${folder}/${name}`;
  if (project.binder.some((i) => i.rel === rel)) return null;

  const order = project.binder.map((i) => i.rel).filter((r) => r !== from && !isWithinRel(r, from));
  // After the part's last descendant, which is where the eye expects an added document.
  let at = order.indexOf(folder);
  if (at === -1) return null;
  while (order[at + 1] !== undefined && isWithinRel(order[at + 1] as string, folder)) at += 1;
  order.splice(at + 1, 0, rel);

  return { move: { from: source.path, to: `${project.path}/${rel}` }, order };
}

/** The Binder's documents, in order — what a compile would read. */
export function documentsOf(project: Project | null): BinderItem[] {
  return (project?.binder ?? []).filter((i) => i.kind === "note");
}
