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
  [
    "Thesis/chapters/04 Methods.md",
    {
      text: "---\naliases: [methodology, interviews]\n---\n\n# Methods\n\n## Interview protocol\n\nText.\n",
      mtime: 1_700_000_000_000,
    },
  ],
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

// Spell-check mock: a handful of classic errors and US spellings are "misspelled".
const MISSPELLED = new Set(["teh", "recieve", "color", "organize", "definately"]);
const SUGGEST: Record<string, string[]> = {
  teh: ["the", "tea", "ten"],
  recieve: ["receive"],
  color: ["colour"],
  organize: ["organise"],
  definately: ["definitely"],
};
const added = new Set<string>();

// Sync mock: a tiny state machine standing in for the Syncthing sidecar.
const sync = {
  enabled: false,
  running: false,
  devices: [] as Array<{ id: string; name: string; connected: boolean; address: string }>,
  folders: [] as Array<{
    id: string;
    label: string;
    path: string;
    state: string;
    completion: number;
    needBytes: number;
    devices: string[];
    error: string | null;
  }>,
  pending: [] as Array<{ id: string; label: string; offeredBy: string; offeredByName: string }>,
};
function syncStatus() {
  return {
    ...sync,
    myId: sync.running ? "AAAAAAA-BBBBBBB-CCCCCCC-DDDDDDD-EEEEEEE-FFFFFFF-GGGGGGG-HHHHHHH" : null,
    version: sync.running ? "v2.1.5" : null,
    guiUrl: "http://127.0.0.1:41384/",
    error: null,
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
      case "folio_index": {
        if (!state.folio) throw { kind: "noFolioOpen" };
        const out: Array<{
          path: string;
          title: string;
          aliases: string[];
          headings: string[];
          mtime: number;
        }> = [];
        const walk = (nodes: TreeNode[]) => {
          for (const n of nodes) {
            if (n.kind === "folder") walk(n.children);
            else if (n.kind === "note") {
              const text = notes.get(n.path)?.text ?? "";
              const fm = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? "";
              const title = /^title:\s*(.+)$/m.exec(fm)?.[1]?.replace(/^["']|["']$/g, "");
              const aliases =
                /^aliases:\s*\[(.*)\]$/m
                  .exec(fm)?.[1]
                  ?.split(",")
                  .map((a) => a.trim().replace(/^["']|["']$/g, ""))
                  .filter(Boolean) ?? [];
              const headings = [...text.matchAll(/^#{1,6}\s+(.+?)\s*#*$/gm)].map((m) => m[1] ?? "");
              out.push({
                path: n.path,
                title: title ?? n.name.replace(/\.md$/i, ""),
                aliases,
                headings,
                mtime: notes.get(n.path)?.mtime ?? n.mtime,
              });
            }
          }
        };
        walk(state.tree);
        return out;
      }
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
      case "spell_check": {
        const words = (a.words as string[]) ?? [];
        return words.filter((w) => MISSPELLED.has(w.toLowerCase()) && !added.has(w));
      }
      case "spell_suggest":
        return SUGGEST[String(a.word).toLowerCase()] ?? [];
      case "spell_add":
        added.add(String(a.word));
        return null;
      case "spell_ignore":
        added.add(String(a.word));
        return null;
      case "sync_status":
        return syncStatus();
      case "sync_enable":
        sync.enabled = true;
        sync.running = true;
        return syncStatus();
      case "sync_disable":
        sync.enabled = false;
        sync.running = false;
        return syncStatus();
      case "sync_add_device": {
        const id = String(a.deviceId).toUpperCase();
        if (id.length < 50)
          throw { kind: "invalidPath", detail: "That does not look like a Syncthing Device ID" };
        sync.running = true;
        sync.enabled = true;
        sync.devices = [
          { id, name: String(a.name || "NAS"), connected: true, address: "192.168.1.20:22000" },
        ];
        // The mock NAS immediately offers a folder, as a real one does after accepting us.
        sync.pending = [
          {
            id: "p6tn7-qnz4c",
            label: "Folio",
            offeredBy: id,
            offeredByName: String(a.name || "NAS"),
          },
        ];
        return syncStatus();
      }
      case "sync_remove_device":
        sync.devices = [];
        sync.pending = [];
        return syncStatus();
      case "sync_accept_folder":
        sync.pending = sync.pending.filter((p) => p.id !== a.folderId);
        sync.folders.push({
          id: String(a.folderId),
          label: String(a.label),
          path: String(a.path),
          state: "idle",
          completion: 100,
          needBytes: 0,
          devices: [String(a.deviceId)],
          error: null,
        });
        return syncStatus();
      case "sync_share_folder":
        sync.folders.push({
          id: "writing",
          label: String(a.label ?? "Writing"),
          path: String(a.path),
          state: "syncing",
          completion: 42,
          needBytes: 1024,
          devices: [String(a.deviceId)],
          error: null,
        });
        return syncStatus();
      case "sync_is_synced_path":
        return sync.folders.some((f) => String(a.path).startsWith(f.path));
      case "sync_log_tail":
        return ["[mock] syncthing v2.1.5 starting", "[mock] Ready to synchronize"];
      case "plugin:event|listen":
        return 1;
      case "plugin:event|unlisten":
        return null;
      default:
        throw new Error(`dev mock: unhandled command ${cmd}`);
    }
  });
}
