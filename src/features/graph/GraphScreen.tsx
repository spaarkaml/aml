import { useEffect, useRef, useState } from "react";
import { Icon } from "@/app/icons";
import { useEditorStore } from "@/features/editor/store";
import { useTabsStore } from "@/features/tabs/store";
import { noteTitle } from "@/lib/paths";
import { GraphCanvas, type GraphControls, LOOSE } from "./GraphCanvas";
import styles from "./GraphScreen.module.css";
import { DEPTHS, useGraphStore } from "./store";

/**
 * The link graph (WP-7.3): what points at what, clustered by Bounding.
 *
 * A screen rather than a panel because a graph is something you go and look at — the local
 * one, which is the version you glance at while writing, lives in the Context panel.
 *
 * The picture runs edge to edge, and the controls float over it on frosted glass the way
 * Maps and Freeform float theirs: what you are looking at is the graph, not the frame.
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
  const controls = useRef<GraphControls>(null);
  const [highlight, setHighlight] = useState<string | null>(null);

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
  const edges = graph?.edges.length ?? 0;
  const loose = graph?.nodes.filter((n) => !n.cluster).length ?? 0;
  const drawn = graph && nodes > 0;

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
        <div className={styles.stage}>
          {error ? (
            <p className={styles.empty} role="alert" data-testid="graph-error">
              {error}
            </p>
          ) : loading && !graph ? (
            <p className={styles.empty}>Working out what points at what…</p>
          ) : drawn ? (
            <GraphCanvas
              graph={graph}
              colours={colours}
              focus={scope === "note" ? focus : null}
              highlight={highlight}
              controls={controls}
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

        <div className={styles.head}>
          <div className={styles.title}>
            <h2>Graph</h2>
            <span data-testid="graph-summary">
              {nodes} {nodes === 1 ? "note" : "notes"} · {edges} {edges === 1 ? "link" : "links"}
              {scope === "note" && focus ? ` around ${noteTitle(focus)}` : ""}
              {graph?.truncated ? ` — the ${nodes} most connected of ${graph.total}` : ""}
            </span>
          </div>

          <div className={styles.glass}>
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
              <>
                <span className={styles.divider} />
                <fieldset className={styles.steps} data-testid="graph-depth">
                  <legend>Steps</legend>
                  {DEPTHS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={depth === d}
                      aria-label={`${d} ${d === 1 ? "step" : "steps"} out`}
                      className={depth === d ? styles.stepActive : styles.step}
                      onClick={() => setDepth(d)}
                    >
                      {d}
                    </button>
                  ))}
                </fieldset>
              </>
            ) : null}
          </div>

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

        {drawn && (graph.clusters.length > 0 || loose > 0) ? (
          <ul
            className={styles.key}
            data-testid="graph-key"
            onMouseLeave={() => setHighlight(null)}
          >
            {graph.clusters.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={highlight === c.id ? styles.keyActive : styles.keyItem}
                  onMouseEnter={() => setHighlight(c.id)}
                  onFocus={() => setHighlight(c.id)}
                  onBlur={() => setHighlight(null)}
                >
                  <span className={styles.dot} style={{ background: c.colour }} />
                  {c.name}
                  <span className={styles.count}>{c.notes}</span>
                </button>
              </li>
            ))}
            {loose > 0 && graph.clusters.length > 0 ? (
              <li>
                <button
                  type="button"
                  className={highlight === LOOSE ? styles.keyActive : styles.keyItem}
                  onMouseEnter={() => setHighlight(LOOSE)}
                  onFocus={() => setHighlight(LOOSE)}
                  onBlur={() => setHighlight(null)}
                >
                  <span className={styles.ring} />
                  In no Bounding
                  <span className={styles.count}>{loose}</span>
                </button>
              </li>
            ) : null}
          </ul>
        ) : null}

        {drawn ? (
          <div className={styles.zoom}>
            <button
              type="button"
              onClick={() => controls.current?.zoom(1 / 1.4)}
              aria-label="Zoom out"
              title="Zoom out"
            >
              <Icon name="minus" size={14} />
            </button>
            <button
              type="button"
              onClick={() => controls.current?.fit()}
              aria-label="Show everything"
              title="Show everything"
              data-testid="graph-fit"
            >
              <Icon name="fit" size={14} />
            </button>
            <button
              type="button"
              onClick={() => controls.current?.zoom(1.4)}
              aria-label="Zoom in"
              title="Zoom in"
            >
              <Icon name="plus" size={14} />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
