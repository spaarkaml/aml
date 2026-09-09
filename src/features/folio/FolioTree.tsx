import { useState } from "react";
import { useEditorStore } from "@/features/editor/store";
import type { TreeNode } from "@/ipc";
import styles from "./FolioTree.module.css";
import { useFolioStore } from "./store";

/**
 * Minimal read-only tree for WP-1.1. WP-1.5 replaces it with the full Folio Browser
 * (drag-move, context menu, badges). Kept simple so the watcher round-trip is visible now.
 */
export function FolioTree() {
  const tree = useFolioStore((s) => s.tree);
  const folio = useFolioStore((s) => s.folio);
  if (!folio) return null;
  if (tree.length === 0) return <p className={styles.empty}>This Folio is empty.</p>;
  return (
    <ul className={styles.tree} data-testid="folio-tree">
      {tree.map((n) => (
        <Node key={n.path} node={n} depth={0} />
      ))}
    </ul>
  );
}

function Node({ node, depth }: { node: TreeNode; depth: number }) {
  const [open, setOpen] = useState(depth < 1);
  const isFolder = node.kind === "folder";
  const openNote = useEditorStore((s) => s.open);
  const current = useEditorStore((s) => s.path);
  return (
    <li className={styles.item}>
      <button
        type="button"
        className={isFolder ? styles.folder : node.kind === "note" ? styles.note : styles.file}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => {
          if (isFolder) setOpen((o) => !o);
          else if (node.kind === "note") void openNote(node.path);
        }}
        data-path={node.path}
        aria-current={current === node.path ? "true" : undefined}
        aria-expanded={isFolder ? open : undefined}
      >
        <span className={styles.glyph}>{isFolder ? (open ? "▾" : "▸") : ""}</span>
        <span className={styles.name}>
          {isFolder ? node.name : node.name.replace(/\.md$/i, "")}
        </span>
      </button>
      {isFolder && open && node.children.length > 0 ? (
        <ul className={styles.tree}>
          {node.children.map((c) => (
            <Node key={c.path} node={c} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
