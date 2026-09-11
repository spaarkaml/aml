import { type DragEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { Icon } from "@/app/icons";
import { useEditorStore } from "@/features/editor/store";
import { ContextMenu, type MenuItem } from "@/features/folio/ContextMenu";
import { freeName, useFolioStore } from "@/features/folio/store";
import { useTabsStore } from "@/features/tabs/store";
import type { BinderItem } from "@/ipc";
import { joinPath, parentDir } from "@/lib/paths";
import styles from "./BinderPanel.module.css";
import { useProjectStore } from "./store";

const DRAG_TYPE = "application/x-aml-binder";
/** Where in a row a drop lands: the outer thirds reorder, a folder's middle nests. */
type Band = "before" | "into" | "after";

/**
 * The Binder (WP-5.2): the Project's documents in reading order, which is the order a
 * compile will use. It replaces the Folio tree in the Browser while a Project is open —
 * inside a book the whole Folio is noise — and the header is the way back out.
 */
export function BinderPanel() {
  const project = useProjectStore((s) => s.project);
  const leave = useProjectStore((s) => s.leave);
  const show = useProjectStore((s) => s.show);
  const createNote = useFolioStore((s) => s.createNote);
  const createFolder = useFolioStore((s) => s.createFolder);
  const refresh = useProjectStore((s) => s.refresh);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);

  if (!project) return null;

  const add = async (kind: "note" | "folder", dir: string) => {
    if (kind === "note") await createNote(dir);
    else await createFolder(dir);
    await refresh();
  };

  return (
    <div className={styles.binder} data-testid="binder">
      <div className={styles.head}>
        <button
          type="button"
          className={styles.back}
          onClick={leave}
          title="Back to the whole Folio"
          data-testid="binder-leave"
        >
          <Icon name="chevronLeft" size={13} />
          Folio
        </button>
        <button
          type="button"
          className={styles.title}
          onClick={() => show("dashboard")}
          title="Project dashboard"
          data-testid="binder-title"
        >
          <Icon name="book" size={13} />
          <span className={styles.titleText}>{project.title}</span>
        </button>
      </div>

      <div className={styles.toolbar}>
        <button type="button" onClick={() => void add("note", project.path)}>
          + Document
        </button>
        <button type="button" onClick={() => void add("folder", project.path)}>
          + Part
        </button>
        <button type="button" onClick={() => show("corkboard")} data-testid="open-corkboard">
          Corkboard
        </button>
      </div>

      {project.binder.length === 0 ? (
        <p className={styles.empty}>
          Nothing in this Project yet. Add a document, or drop notes into its folder.
        </p>
      ) : (
        <ul className={styles.rows} data-testid="binder-rows">
          {project.binder.map((item) => (
            <Row
              key={item.rel}
              item={item}
              renaming={renaming === item.rel}
              startRename={setRenaming}
              openMenu={setMenu}
              add={add}
            />
          ))}
        </ul>
      )}
      {menu ? (
        <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />
      ) : null}
    </div>
  );
}

interface RowProps {
  item: BinderItem;
  renaming: boolean;
  startRename: (rel: string | null) => void;
  openMenu: (m: { x: number; y: number; items: MenuItem[] }) => void;
  add: (kind: "note" | "folder", dir: string) => Promise<void>;
}

function Row({ item, renaming, startRename, openMenu, add }: RowProps) {
  const openTab = useTabsStore((s) => s.open);
  const current = useEditorStore((s) => s.path === item.path);
  const include = useProjectStore((s) => s.include);
  const drop = useProjectStore((s) => s.drop);
  const nest = useProjectStore((s) => s.nest);
  const trash = useFolioStore((s) => s.trash);
  const refresh = useProjectStore((s) => s.refresh);
  const [band, setBand] = useState<Band | null>(null);
  const isFolder = item.kind === "folder";

  const items: MenuItem[] = [
    ...(isFolder
      ? [
          { label: "New Document", run: () => void add("note", item.path) },
          { label: "New Part", run: () => void add("folder", item.path) },
        ]
      : []),
    { label: "Rename", run: () => startRename(item.rel) },
    {
      label: item.include ? "Leave out of the compile" : "Include in the compile",
      run: () => void include(item.rel, !item.include),
    },
    {
      label: "Move to Trash…",
      run: () => void trash(item.path).then(() => refresh()),
      danger: true,
    },
  ];

  const bandOf = (e: DragEvent<HTMLElement>): Band => {
    const box = e.currentTarget.getBoundingClientRect();
    const y = (e.clientY - box.top) / box.height;
    if (isFolder && y > 0.3 && y < 0.7) return "into";
    return y < 0.5 ? "before" : "after";
  };

  if (renaming) {
    return (
      <li className={styles.row}>
        <RenameField item={item} onDone={() => startRename(null)} />
      </li>
    );
  }

  return (
    <li className={styles.row}>
      <button
        type="button"
        className={isFolder ? styles.part : styles.document}
        style={{ paddingLeft: 6 + item.depth * 14 }}
        draggable
        data-band={band ?? undefined}
        data-out={item.include ? undefined : ""}
        data-testid={`binder-${item.rel}`}
        aria-current={current ? "true" : undefined}
        onDragStart={(e) => {
          e.dataTransfer.setData(DRAG_TYPE, item.rel);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
          e.preventDefault();
          setBand(bandOf(e));
        }}
        onDragLeave={() => setBand(null)}
        onDrop={(e) => {
          e.preventDefault();
          const from = e.dataTransfer.getData(DRAG_TYPE);
          const where = bandOf(e);
          setBand(null);
          if (!from) return;
          if (where === "into") void nest(from, item.rel);
          else void drop(from, item.rel, where === "before");
        }}
        onClick={() => {
          if (!isFolder) openTab(item.path);
        }}
        onKeyDown={(e: KeyboardEvent) => {
          if (e.key === "F2") {
            e.preventDefault();
            startRename(item.rel);
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          openMenu({ x: e.clientX, y: e.clientY, items });
        }}
      >
        <Icon name={isFolder ? "folder" : "file"} size={13} className={styles.kind} />
        <span className={styles.name}>{item.name}</span>
        {item.status ? <span className={styles.status}>{item.status}</span> : null}
        <span className={styles.words}>{item.words ? item.words.toLocaleString("en-AU") : ""}</span>
      </button>
      <button
        type="button"
        className={styles.include}
        aria-pressed={item.include}
        aria-label={`${item.include ? "In" : "Out of"} the compile: ${item.name}`}
        title={item.include ? "In the compile" : "Left out of the compile"}
        data-testid={`include-${item.rel}`}
        onClick={() => void include(item.rel, !item.include)}
      >
        <Icon name="check" size={11} />
      </button>
    </li>
  );
}

/** Inline rename, matching the Browser's: Enter commits, Escape cancels, blur commits. */
function RenameField({ item, onDone }: { item: BinderItem; onDone: () => void }) {
  const rename = useFolioStore((s) => s.rename);
  const tree = useFolioStore((s) => s.tree);
  const refresh = useProjectStore((s) => s.refresh);
  const [value, setValue] = useState(item.name);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const commit = async () => {
    if (done.current) return;
    done.current = true;
    const name = value.trim().replace(/[/\\]/g, "-");
    onDone();
    if (!name || name === item.name) return;
    const dir = parentDir(item.path);
    const isNote = item.kind === "note";
    await rename(item.path, joinPath(dir, freeName(tree, dir, name, isNote ? ".md" : "")));
    await refresh();
  };

  return (
    <input
      ref={ref}
      className={styles.rename}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          void commit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          done.current = true;
          onDone();
        }
      }}
      onBlur={() => void commit()}
      aria-label={`Rename ${item.name}`}
      data-testid="binder-rename"
    />
  );
}
