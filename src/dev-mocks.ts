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

export function installDevMocks(): void {
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
      case "plugin:event|listen":
        return 1;
      case "plugin:event|unlisten":
        return null;
      default:
        throw new Error(`dev mock: unhandled command ${cmd}`);
    }
  });
}
