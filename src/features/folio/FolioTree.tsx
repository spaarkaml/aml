import {
  type DragEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useEditorStore } from "@/features/editor/store";
import { useTabsStore } from "@/features/tabs/store";
import type { TreeNode } from "@/ipc";
import { baseName, isWithin, joinPath, noteTitle, parentDir } from "@/lib/paths";
import { useBrowserStore } from "./browserStore";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import styles from "./FolioTree.module.css";
import { useFolioStore } from "./store";

interface Menu {
  x: number;
  y: number;
  items: MenuItem[];
}

const DRAG_TYPE = "application/x-aml-path";

/**
 * The Folio Browser: the note tree with create / rename / move / trash, expanded state per
 * Folio (per device), the active note highlighted and an unsaved badge.
 */
export function FolioTree() {
  const tree = useFolioStore((s) => s.tree);
  const folio = useFolioStore((s) => s.folio);
  const createNote = useFolioStore((s) => s.createNote);
  const createFolder = useFolioStore((s) => s.createFolder);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [dropRoot, setDropRoot] = useState(false);
  const closeMenu = useCallback(() => setMenu(null), []);

  if (!folio) return null;

  const rootItems: MenuItem[] = [
    { label: "New Note", run: () => void createNote("") },
    { label: "New Folder", run: () => void createFolder("") },
  ];

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: drop zone and context-menu surface for the whole Browser
    <div
      className={dropRoot ? styles.browserDrop : styles.browser}
      data-testid="folio-browser"
      onContextMenu={(e) => {
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY, items: rootItems });
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
        e.preventDefault();
        if (e.target === e.currentTarget) setDropRoot(true);
      }}
      onDragLeave={() => setDropRoot(false)}
      onDrop={(e) => {
        setDropRoot(false);
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        void moveTo(e.dataTransfer.getData(DRAG_TYPE), "");
      }}
    >
      <div className={styles.toolbar}>
        <button type="button" onClick={() => void createNote("")} title="New note at the top level">
          + Note
        </button>
        <button
          type="button"
          onClick={() => void createFolder("")}
          title="New folder at the top level"
        >
          + Folder
        </button>
      </div>
      {tree.length === 0 ? (
        <p className={styles.empty}>This Folio is empty.</p>
      ) : (
        <ul className={styles.tree} data-testid="folio-tree">
          {tree.map((n) => (
            <Node key={n.path} node={n} depth={0} openMenu={setMenu} />
          ))}
        </ul>
      )}
      {menu ? <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={closeMenu} /> : null}
    </div>
  );
}

async function moveTo(source: string, dir: string): Promise<void> {
  if (!source) return;
  if (isWithin(dir, source)) return; // cannot move a folder into itself
  if (parentDir(source) === dir) return;
  await useFolioStore.getState().rename(source, joinPath(dir, baseName(source)));
}

interface NodeProps {
  node: TreeNode;
  depth: number;
  openMenu: (m: Menu) => void;
}

function Node({ node, depth, openMenu }: NodeProps) {
  const isFolder = node.kind === "folder";
  const expanded = useBrowserStore((s) => s.isExpanded(node.path, depth));
  const toggle = useBrowserStore((s) => s.toggle);
  const renaming = useBrowserStore((s) => s.renaming === node.path);
  const startRename = useBrowserStore((s) => s.startRename);
  const openTab = useTabsStore((s) => s.open);
  const current = useEditorStore((s) => s.path === node.path);
  const dirty = useEditorStore((s) => s.dirty && s.path === node.path);
  const createNote = useFolioStore((s) => s.createNote);
  const createFolder = useFolioStore((s) => s.createFolder);
  const trash = useFolioStore((s) => s.trash);
  const [dropTarget, setDropTarget] = useState(false);

  const label = isFolder ? node.name : node.kind === "note" ? noteTitle(node.path) : node.name;

  const items: MenuItem[] = [
    ...(isFolder
      ? [
          { label: "New Note", run: () => void createNote(node.path) },
          { label: "New Folder", run: () => void createFolder(node.path) },
        ]
      : []),
    { label: "Rename", run: () => startRename(node.path) },
    { label: "Move to Trash…", run: () => void trash(node.path), danger: true },
  ];

  const onDragOver = (e: DragEvent) => {
    if (!isFolder || !e.dataTransfer.types.includes(DRAG_TYPE)) return;
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(true);
  };
  const onDrop = (e: DragEvent) => {
    if (!isFolder) return;
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(false);
    void moveTo(e.dataTransfer.getData(DRAG_TYPE), node.path);
  };

  return (
    <li className={styles.item}>
      {renaming ? (
        <RenameField node={node} depth={depth} />
      ) : (
        <button
          type="button"
          className={
            isFolder
              ? dropTarget
                ? styles.folderDrop
                : styles.folder
              : node.kind === "note"
                ? styles.note
                : styles.file
          }
          style={{ paddingLeft: 8 + depth * 14 }}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData(DRAG_TYPE, node.path);
            e.dataTransfer.setData("text/plain", node.path);
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragOver={onDragOver}
          onDragLeave={() => setDropTarget(false)}
          onDrop={onDrop}
          onClick={() => {
            if (isFolder) toggle(node.path, depth);
            else if (node.kind === "note") openTab(node.path);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            openMenu({ x: e.clientX, y: e.clientY, items });
          }}
          onKeyDown={(e) => {
            if (e.key === "F2") {
              e.preventDefault();
              startRename(node.path);
            }
          }}
          data-path={node.path}
          aria-current={current ? "true" : undefined}
          aria-expanded={isFolder ? expanded : undefined}
        >
          <span className={styles.glyph}>{isFolder ? (expanded ? "▾" : "▸") : ""}</span>
          <span className={styles.name}>{label}</span>
          {dirty ? (
            <span className={styles.dot} role="img" aria-label="Unsaved changes">
              ●
            </span>
          ) : null}
        </button>
      )}
      {isFolder && expanded && node.children.length > 0 ? (
        <ul className={styles.tree}>
          {node.children.map((c) => (
            <Node key={c.path} node={c} depth={depth + 1} openMenu={openMenu} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** Inline rename: Enter commits, Escape cancels, blur commits (matching Finder / Explorer). */
function RenameField({ node, depth }: { node: TreeNode; depth: number }) {
  const isNote = node.kind === "note";
  const initial = isNote ? noteTitle(node.path) : node.name;
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  const stop = useBrowserStore((s) => s.startRename);
  const rename = useFolioStore((s) => s.rename);
  const done = useRef(false);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const commit = async () => {
    if (done.current) return;
    done.current = true;
    const name = value.trim().replace(/[/\\]/g, "-");
    stop(null);
    if (!name || name === initial) return;
    const to = joinPath(parentDir(node.path), isNote ? `${name}.md` : name);
    await rename(node.path, to);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      done.current = true;
      stop(null);
    }
  };

  return (
    <input
      ref={ref}
      className={styles.rename}
      style={{ marginLeft: 8 + depth * 14 }}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={onKey}
      onBlur={() => void commit()}
      aria-label={`Rename ${initial}`}
      data-testid="rename-field"
    />
  );
}
