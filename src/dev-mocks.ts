/**
 * Loaded only when the app runs in a plain browser in dev (no Tauri runtime), i.e. for
 * Playwright e2e and quick UI work. Mocks every IPC command with an in-memory Folio.
 * Never imported in production; main.tsx guards it.
 */
import { mockIPC } from "@tauri-apps/api/mocks";
import type { FolioInfo, RecentFolio, TreeNode } from "@/ipc";

const MOCK_ROOT = "/mock/Writing";

function node(
  name: string,
  path: string,
  kind: TreeNode["kind"],
  children: TreeNode[] = [],
): TreeNode {
  return {
    name,
    path,
    kind,
    mtime: 1_700_000_000_000,
    size: kind === "folder" ? 0 : 120,
    children,
  };
}

const notes = new Map<string, { text: string; mtime: number }>([
  [
    "Thesis/chapters/03 Influence networks.md",
    {
      text: "---\ntype: chapter\nstatus: drafting\n---\n\n# Influence networks\n\nThe distinction between persuasion and manipulation is rarely visible from inside a single message. See [[04 Methods]] and [@rid2020, p. 41]. #thesis/ch3\n\n## Three properties\n\n- [ ] repetition without attribution\n- [x] collapse of the interval\n\n> [!note] Callout\n> Held verbatim.\n",
      mtime: 1_700_000_000_000,
    },
  ],
  ["Inbox.md", { text: "Quick thoughts.\n", mtime: 1_700_000_000_000 }],
]);

const state: { folio: FolioInfo | null; tree: TreeNode[]; recent: RecentFolio[] } = {
  folio: null,
  tree: [
    node("Thesis", "Thesis", "folder", [
      node("chapters", "Thesis/chapters", "folder", [
        node("03 Influence networks.md", "Thesis/chapters/03 Influence networks.md", "note"),
        node("04 Methods.md", "Thesis/chapters/04 Methods.md", "note"),
      ]),
      node("research", "Thesis/research", "folder", [
        node("Rid 2020.pdf", "Thesis/research/Rid 2020.pdf", "file"),
      ]),
    ]),
    node("The Salt Road", "The Salt Road", "folder", [
      node("Three.md", "The Salt Road/Three.md", "note"),
    ]),
    node("journal", "journal", "folder", [node("2026-09-09.md", "journal/2026-09-09.md", "note")]),
    node("Inbox.md", "Inbox.md", "note"),
  ],
  recent: [{ path: MOCK_ROOT, name: "Writing", lastOpened: 1_700_000_000_000 }],
};

function findNode(tree: TreeNode[], path: string): TreeNode | undefined {
  for (const n of tree) {
    if (n.path === path) return n;
    const hit = findNode(n.children, path);
    if (hit) return hit;
  }
  return undefined;
}

function siblingsOf(path: string): TreeNode[] | undefined {
  const i = path.lastIndexOf("/");
  if (i === -1) return state.tree;
  return findNode(state.tree, path.slice(0, i))?.children;
}

function sortNodes(list: TreeNode[]): void {
  list.sort((x, y) =>
    x.kind === "folder" && y.kind !== "folder"
      ? -1
      : x.kind !== "folder" && y.kind === "folder"
        ? 1
        : x.name.localeCompare(y.name),
  );
}

function insertNode(n: TreeNode): void {
  const list = siblingsOf(n.path);
  if (!list) throw { kind: "notFound", detail: n.path };
  list.push(n);
  sortNodes(list);
}

function removeNode(path: string): TreeNode | undefined {
  const list = siblingsOf(path);
  const i = list?.findIndex((n) => n.path === path) ?? -1;
  if (!list || i === -1) return undefined;
  return list.splice(i, 1)[0];
}

function remap(n: TreeNode, from: string, to: string): TreeNode {
  const path = to + n.path.slice(from.length);
  return {
    ...n,
    path,
    name: path.split("/").pop() ?? path,
    children: n.children.map((c) => remap(c, from, to)),
  };
}

export function installDevMocks(): void {
  // Exposed for e2e assertions on what the app wrote.
  (window as unknown as { __amlMockNotes: typeof notes }).__amlMockNotes = notes;
  mockIPC((cmd, args) => {
    const a = (args ?? {}) as Record<string, unknown>;
    switch (cmd) {
      case "app_info":
        return {
          name: "AML",
          version: "0.0.0-browser",
          platform: "browser",
          arch: "mock",
          debug: true,
        };
      case "plugin:dialog|open":
        return MOCK_ROOT;
      case "plugin:dialog|message": {
        // confirm() compares the result with its OK label; always "click" OK in the mock.
        const buttons = a.buttons as { OkCancelCustom?: string[] } | string | undefined;
        return typeof buttons === "object" && buttons.OkCancelCustom
          ? buttons.OkCancelCustom[0]
          : "Ok";
      }
      case "entry_create_note": {
        const path = String(a.path);
        if (findNode(state.tree, path)) throw { kind: "alreadyExists", detail: path };
        notes.set(path, { text: "", mtime: Date.now() });
        insertNode(node(path.split("/").pop() ?? path, path, "note"));
        return { path, mtime: Date.now(), size: 0 };
      }
      case "entry_create_folder": {
        const path = String(a.path);
        if (findNode(state.tree, path)) throw { kind: "alreadyExists", detail: path };
        insertNode(node(path.split("/").pop() ?? path, path, "folder"));
        return null;
      }
      case "entry_rename": {
        const from = String(a.from);
        const to = String(a.to);
        const n = removeNode(from);
        if (!n) throw { kind: "notFound", detail: from };
        if (findNode(state.tree, to)) throw { kind: "alreadyExists", detail: to };
        insertNode(remap(n, from, to));
        for (const [p, v] of [...notes]) {
          if (p === from || p.startsWith(`${from}/`)) {
            notes.delete(p);
            notes.set(to + p.slice(from.length), v);
          }
        }
        return null;
      }
      case "entry_trash": {
        const path = String(a.path);
        if (!removeNode(path)) throw { kind: "notFound", detail: path };
        for (const p of [...notes.keys()])
          if (p === path || p.startsWith(`${path}/`)) notes.delete(p);
        return null;
      }
      case "folio_current":
        return state.folio;
      case "folio_recent":
        return state.recent;
      case "folio_open":
      case "folio_create": {
        const path = String(a.path ?? MOCK_ROOT);
        if (path.endsWith("not-a-folio")) throw { kind: "notAFolio", detail: path };
        state.folio = { root: path, name: path.split("/").pop() ?? "Folio", noteCount: 5 };
        return state.folio;
      }
      case "folio_close":
        state.folio = null;
        return null;
      case "folio_tree":
        if (!state.folio) throw { kind: "noFolioOpen" };
        return state.tree;
      case "note_read": {
        const path = String(a.path);
        const n = notes.get(path) ?? { text: "", mtime: 1 };
        return { path, text: n.text, mtime: n.mtime, size: n.text.length };
      }
      case "note_write": {
        const path = String(a.path);
        const mtime = Date.now();
        notes.set(path, { text: String(a.text), mtime });
        return { path, mtime, size: String(a.text).length };
      }
      case "asset_write": {
        const name = String(a.fileName);
        return {
          path: `assets/20260910-000000-${name}`,
          markdownPath: `assets/20260910-000000-${name}`,
          absolute: `/mock/assets/${name}`,
          size: 1,
        };
      }
      case "asset_import": {
        const name = String(a.source).split("/").pop() ?? "image.png";
        return {
          path: `assets/20260910-000000-${name}`,
          markdownPath: `assets/20260910-000000-${name}`,
          absolute: `/mock/assets/${name}`,
          size: 1,
        };
      }
      case "asset_resolve":
        return `/mock/${String(a.target)}`;
      case "plugin:event|listen":
        return 1;
      case "plugin:event|unlisten":
        return null;
      default:
        throw new Error(`dev mock: unhandled command ${cmd}`);
    }
  });
}
