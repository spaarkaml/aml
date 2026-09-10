import { create } from "zustand";
import { commands, type LinkQuery, type RenamePreview } from "@/ipc";

export type RenameDecision = "update" | "skip" | "cancel";

interface PendingRename {
  preview: RenamePreview;
  decide: (d: RenameDecision) => void;
}

interface LinkState {
  /** `[[` autocomplete, written by the LinkMenu ProseMirror plugin. */
  active: boolean;
  /** Document position of the opening `[[`. */
  from: number;
  query: string;
  index: number;
  /** Number of rows the menu currently shows; Enter is only captured when > 0. */
  count: number;
  left: number;
  bottom: number;
  /** Rename-with-links dialog, when a rename touches links. */
  pendingRename: PendingRename | null;
  lastRename: { from: string; to: string } | null;
  /** Bumped whenever the Folio changed on disk; link plugins re-resolve on it. */
  version: number;
  set: (s: Partial<LinkState>) => void;
  invalidate: () => void;
}

export const useLinkStore = create<LinkState>((set) => ({
  active: false,
  from: 0,
  query: "",
  index: 0,
  count: 0,
  left: 0,
  bottom: 0,
  pendingRename: null,
  lastRename: null,
  version: 0,
  set: (s) => set(s),
  invalidate: () => {
    cache.clear();
    set((s) => ({ version: s.version + 1 }));
  },
}));

const cache = new Map<string, string | null>();

function cacheKey(from: string, l: LinkQuery): string {
  return `${from} ${l.kind} ${l.target}`;
}

/** Key of a link in the maps returned by `resolveLinks`. */
export function linkKey(l: LinkQuery): string {
  return `${l.kind}:${l.target}`;
}

/** Resolves links as seen from `from`, memoised until the Folio changes. */
export async function resolveLinks(
  from: string,
  links: LinkQuery[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const missing: LinkQuery[] = [];
  for (const l of links) {
    const k = cacheKey(from, l);
    if (cache.has(k)) out.set(linkKey(l), cache.get(k) ?? null);
    else missing.push(l);
  }
  if (missing.length) {
    const r = await commands.linkResolve(from, missing);
    if (r.status === "ok") {
      missing.forEach((l, i) => {
        const v = r.data[i] ?? null;
        cache.set(cacheKey(from, l), v);
        out.set(linkKey(l), v);
      });
    }
  }
  return out;
}

/** Shows the rename dialog and waits for the user's choice. */
export function askRenameDecision(preview: RenamePreview): Promise<RenameDecision> {
  return new Promise((resolve) => {
    useLinkStore.getState().set({
      pendingRename: {
        preview,
        decide: (d) => {
          useLinkStore.getState().set({ pendingRename: null });
          resolve(d);
        },
      },
    });
  });
}
