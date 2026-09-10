import type { TagEntry } from "@/ipc";

export interface TagNode {
  /** Last segment, e.g. `ch3`. */
  name: string;
  /** Full tag, e.g. `thesis/ch3`. */
  tag: string;
  /** Distinct notes carrying this tag or any tag beneath it. */
  notes: number;
  /** Distinct notes carrying exactly this tag. */
  direct: number;
  children: TagNode[];
}

interface Build {
  node: TagNode;
  paths: Set<string>;
  kids: Map<string, Build>;
}

function ensure(parent: Build, name: string, tag: string): Build {
  let b = parent.kids.get(name);
  if (!b) {
    b = {
      node: { name, tag, notes: 0, direct: 0, children: [] },
      paths: new Set(),
      kids: new Map(),
    };
    parent.kids.set(name, b);
  }
  return b;
}

function finish(b: Build): TagNode {
  const children = [...b.kids.values()]
    .map(finish)
    .sort((x, y) => x.name.localeCompare(y.name, "en-AU"));
  b.node.children = children;
  b.node.notes = b.paths.size;
  return b.node;
}

/** Nests `a/b/c` tags and counts distinct notes per subtree. */
export function buildTagTree(entries: readonly TagEntry[]): TagNode[] {
  const root: Build = {
    node: { name: "", tag: "", notes: 0, direct: 0, children: [] },
    paths: new Set(),
    kids: new Map(),
  };
  const direct = new Map<string, Set<string>>();
  for (const e of entries) {
    const segments = e.tag.split("/").filter(Boolean);
    let cur = root;
    let full = "";
    for (const seg of segments) {
      full = full ? `${full}/${seg}` : seg;
      cur = ensure(cur, seg, full);
      cur.paths.add(e.path);
    }
    if (!direct.has(e.tag)) direct.set(e.tag, new Set());
    direct.get(e.tag)?.add(e.path);
  }
  const apply = (b: Build) => {
    b.node.direct = direct.get(b.node.tag)?.size ?? 0;
    for (const k of b.kids.values()) apply(k);
  };
  apply(root);
  return finish(root).children;
}

/** Notes carrying `tag` or a tag beneath it, deduplicated, in path order. */
export function notesForTag(entries: readonly TagEntry[], tag: string): TagEntry[] {
  const seen = new Set<string>();
  return entries
    .filter((e) => e.tag === tag || e.tag.startsWith(`${tag}/`))
    .filter((e) => {
      if (seen.has(e.path)) return false;
      seen.add(e.path);
      return true;
    })
    .sort((a, b) => a.path.localeCompare(b.path, "en-AU"));
}

/** Every ancestor of a tag, outermost first: `a/b/c` → `["a", "a/b"]`. */
export function ancestorsOf(tag: string): string[] {
  const parts = tag.split("/");
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join("/"));
}
