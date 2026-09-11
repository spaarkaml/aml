import { useMemo } from "react";
import { useTabsStore } from "@/features/tabs/store";
import { parentDir } from "@/lib/paths";
import { useTagsStore } from "./store";
import styles from "./TagsPanel.module.css";
import { buildTagTree, notesForTag, type TagNode } from "./tree";

function Node({ node, depth }: { node: TagNode; depth: number }) {
  const expanded = useTagsStore((s) => s.expanded[node.tag] ?? false);
  const selected = useTagsStore((s) => s.selected === node.tag);
  const toggle = useTagsStore((s) => s.toggle);
  const select = useTagsStore((s) => s.select);
  const hasKids = node.children.length > 0;
  return (
    <li className={styles.item}>
      <div className={styles.row} style={{ paddingLeft: 8 + depth * 14 }}>
        {hasKids ? (
          <button
            type="button"
            className={styles.twisty}
            onClick={() => toggle(node.tag)}
            aria-label={expanded ? `Collapse ${node.tag}` : `Expand ${node.tag}`}
          >
            <span className={styles.chevron} data-expanded={expanded ? "" : undefined} />
          </button>
        ) : (
          <span className={styles.twisty} />
        )}
        <button
          type="button"
          className={selected ? styles.tagActive : styles.tag}
          onClick={() => select(selected ? null : node.tag)}
          title={`#${node.tag}`}
          data-testid={`tag-${node.tag}`}
        >
          <span className={styles.name}>#{node.name}</span>
          <span className={styles.count}>{node.notes}</span>
        </button>
      </div>
      {hasKids && expanded ? (
        <ul className={styles.list}>
          {node.children.map((c) => (
            <Node key={c.tag} node={c} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** Tag hierarchy with note counts; selecting a tag lists its notes below (WP-2.4). */
export function TagsPanel() {
  const entries = useTagsStore((s) => s.entries);
  const selected = useTagsStore((s) => s.selected);
  const open = useTabsStore((s) => s.open);
  const tree = useMemo(() => buildTagTree(entries), [entries]);
  const notes = useMemo(
    () => (selected ? notesForTag(entries, selected) : []),
    [entries, selected],
  );

  return (
    <div className={styles.panel} data-testid="tags-panel">
      {tree.length === 0 ? (
        <p className={styles.empty}>
          No tags yet. Type #tag in a note or add `tags:` to its properties.
        </p>
      ) : (
        <ul className={styles.list} data-testid="tags-tree">
          {tree.map((n) => (
            <Node key={n.tag} node={n} depth={0} />
          ))}
        </ul>
      )}
      {selected ? (
        <section className={styles.notes} data-testid="tag-notes">
          <h3 className={styles.head}>
            #{selected} · {notes.length} {notes.length === 1 ? "note" : "notes"}
          </h3>
          <ul className={styles.list}>
            {notes.map((n) => (
              <li key={n.path}>
                <button
                  type="button"
                  className={styles.note}
                  onClick={() => open(n.path)}
                  title={n.path}
                >
                  <span className={styles.name}>{n.title}</span>
                  <span className={styles.folder}>{parentDir(n.path) || "/"}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
