import { useEffect } from "react";
import { Icon } from "@/app/icons";
import { useEditorStore } from "@/features/editor/store";
import { useTabsStore } from "@/features/tabs/store";
import { noteTitle } from "@/lib/paths";
import { GraphCanvas } from "./GraphCanvas";
import styles from "./GraphScreen.module.css";
import { DEPTHS, useGraphStore } from "./store";

/**
 * The link graph (WP-7.3): what points at what, clustered by Bounding.
 *
 * A screen rather than a panel because a graph is something you go and look at — the local
 * one, which is the version you glance at while writing, lives in the Context panel.
 */
export function GraphScreen() {
  const open = useGraphStore((s) => s.open);
  const setOpen = useGraphStore((s) => s.setOpen);
  const scope = useGraphStore((s) => s.scope);
  const setScope = useGraphStore((s) => s.setScope);
  const depth = useGraphStore((s) => s.depth);
  const setDepth = useGraphStore((s) => s.setDepth);
  const graph = useGraphStore((s) => s.graph);
  const loading = useGraphStore((s) => s.loading);
  const error = useGraphStore((s) => s.error);
  const focus = useGraphStore((s) => s.focus);
  const refocus = useGraphStore((s) => s.refocus);
  const load = useGraphStore((s) => s.load);
  const notePath = useEditorStore((s) => s.path);
  const openTab = useTabsStore((s) => s.open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  // Opening the graph while a note is open draws it around that note unless you have said
  // otherwise — the question a graph answers is usually about where you already are.
  useEffect(() => {
    if (!open) return;
    void load(useGraphStore.getState().scope === "note" ? (focus ?? notePath) : null);
    // Only when the screen opens: the graph is a picture, not a live feed.
  }, [open, load, notePath, focus]);

  if (!open) return null;

  // The colours come with the graph: Rust read them from the Boundings that are on screen,
  // so the key and the dots cannot disagree.
  const colours = new Map((graph?.clusters ?? []).map((c) => [c.id, c.colour]));
  const nodes = graph?.nodes.length ?? 0;

  return (
    <div className={styles.backdrop} data-testid="graph-backdrop">
      <button
        type="button"
        className={styles.backdropButton}
        onMouseDown={() => setOpen(false)}
        tabIndex={-1}
        aria-label="Close the graph"
      />
      <div className={styles.panel} role="dialog" aria-label="Link graph">
        <div className={styles.head}>
          <h2>Graph</h2>
          <div className={styles.segmented}>
            <button
              type="button"
              aria-pressed={scope === "folio"}
              className={scope === "folio" ? styles.segmentActive : styles.segment}
              onClick={() => setScope("folio")}
              data-testid="graph-scope-folio"
            >
              Whole Folio
            </button>
            <button
              type="button"
              aria-pressed={scope === "note"}
              className={scope === "note" ? styles.segmentActive : styles.segment}
              onClick={() => {
                useGraphStore.setState({ focus: focus ?? notePath });
                setScope("note");
              }}
              disabled={!notePath && !focus}
              data-testid="graph-scope-note"
            >
              Around this note
            </button>
          </div>
          {scope === "note" ? (
            <label className={styles.depth}>
              Steps
              <select
                value={depth}
                onChange={(e) => setDepth(Number(e.target.value))}
                data-testid="graph-depth"
              >
                {DEPTHS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <span className={styles.spacer} />
          <button
            type="button"
            className={styles.close}
            onClick={() => setOpen(false)}
            aria-label="Close"
            data-testid="graph-close"
          >
            <Icon name="close" size={14} />
          </button>
        </div>

        <div className={styles.stage}>
          {error ? (
            <p className={styles.empty} role="alert" data-testid="graph-error">
              {error}
            </p>
          ) : loading && !graph ? (
            <p className={styles.empty}>Working out what points at what…</p>
          ) : graph && nodes > 0 ? (
            <GraphCanvas
              graph={graph}
              colours={colours}
              focus={scope === "note" ? focus : null}
              onOpen={(path) => {
                openTab(path);
                setOpen(false);
              }}
              onRefocus={(path) => void refocus(path)}
            />
          ) : (
            <p className={styles.empty} data-testid="graph-empty">
              {scope === "note"
                ? "Open a note to see what it is connected to."
                : "No notes to draw yet."}
            </p>
          )}
        </div>

        <div className={styles.foot}>
          <span data-testid="graph-summary">
            {nodes} {nodes === 1 ? "note" : "notes"}, {graph?.edges.length ?? 0}{" "}
            {graph?.edges.length === 1 ? "link" : "links"}
            {scope === "note" && focus ? ` around ${noteTitle(focus)}` : ""}
            {graph?.truncated ? ` — the ${nodes} most connected of ${graph.total}` : ""}
          </span>
          {graph && graph.clusters.length > 0 ? (
            <ul className={styles.key} data-testid="graph-key">
              {graph.clusters.map((c) => (
                <li key={c.id}>
                  <span className={styles.dot} style={{ background: c.colour }} />
                  {c.name} · {c.notes}
                </li>
              ))}
            </ul>
          ) : null}
          <span className={styles.spacer} />
          <span>Click to open · double-click to centre on a note · drag to place one</span>
        </div>
      </div>
    </div>
  );
}
