import { useEffect, useState } from "react";
import { useEditorStore } from "@/features/editor/store";
import { useTabsStore } from "@/features/tabs/store";
import { commands, type Graph } from "@/ipc";
import { GraphCanvas } from "./GraphCanvas";
import styles from "./GraphPanel.module.css";
import { useGraphStore } from "./store";

/**
 * The open note's own corner of the graph (WP-7.3), in the Context panel.
 *
 * One step out, always: the question this answers is "what is this note next to", and two
 * steps in a small box is a smudge. The whole Folio is a screen of its own — the link below
 * opens it already centred here.
 */
export function GraphPanel() {
  const path = useEditorStore((s) => s.path);
  const openTab = useTabsStore((s) => s.open);
  const openScreen = useGraphStore((s) => s.setOpen);
  const refocus = useGraphStore((s) => s.refocus);
  const [graph, setGraph] = useState<Graph | null>(null);

  useEffect(() => {
    if (!path) {
      setGraph(null);
      return;
    }
    let stale = false;
    void commands.graphBuild(path, 1).then((r) => {
      if (!stale) setGraph(r.status === "ok" ? r.data : null);
    });
    return () => {
      stale = true;
    };
  }, [path]);

  if (!path) return <p className={styles.empty}>Open a note to see what it links to.</p>;
  if (!graph || graph.nodes.length <= 1) {
    return (
      <p className={styles.empty} data-testid="graph-panel-empty">
        Nothing links to this note yet, and it links to nothing.
      </p>
    );
  }

  const colours = new Map(graph.clusters.map((c) => [c.id, c.colour]));
  return (
    <div className={styles.panel} data-testid="graph-panel">
      <GraphCanvas
        graph={graph}
        colours={colours}
        focus={path}
        compact
        onOpen={openTab}
        onRefocus={(p) => void refocus(p)}
      />
      <button
        type="button"
        className={styles.more}
        onClick={() => {
          void refocus(path);
          openScreen(true);
        }}
      >
        Open the graph
      </button>
    </div>
  );
}
