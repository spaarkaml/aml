import { useEffect, useState } from "react";
import { Icon } from "@/app/icons";
import { useTabsStore } from "@/features/tabs/store";
import { commands, type Graph } from "@/ipc";
import { GraphCanvas } from "./GraphCanvas";
import styles from "./GraphCard.module.css";
import { useGraphStore } from "./store";

/**
 * The whole Folio as a small map, on the Overview beside what you were last writing (WP-7.3
 * follow-up). A shape rather than a tool: which Boundings there are, how big they have grown
 * and what is drifting loose — the sort of thing you read in a glance on the way past.
 *
 * Expand opens the same graph full size, over everything, the way ⌘K opens the palette.
 */
export function GraphCard() {
  const openTab = useTabsStore((s) => s.open);
  const setOpen = useGraphStore((s) => s.setOpen);
  const setScope = useGraphStore((s) => s.setScope);
  const [graph, setGraph] = useState<Graph | null>(null);

  useEffect(() => {
    let stale = false;
    void commands.graphBuild(null, 1).then((r) => {
      if (!stale) setGraph(r.status === "ok" ? r.data : null);
    });
    return () => {
      stale = true;
    };
  }, []);

  const expand = () => {
    if (useGraphStore.getState().scope !== "folio") setScope("folio");
    setOpen(true);
  };

  const colours = new Map((graph?.clusters ?? []).map((c) => [c.id, c.colour]));
  const nodes = graph?.nodes.length ?? 0;

  return (
    <section className={styles.card} data-testid="overview-graph">
      <div className={styles.head}>
        <h2 className={styles.title}>Graph</h2>
        <button
          type="button"
          className={styles.expand}
          onClick={expand}
          data-testid="overview-graph-expand"
          title="Open the graph"
        >
          <Icon name="fit" size={13} />
          Expand
        </button>
      </div>
      <div className={styles.stage}>
        {graph && nodes > 0 ? (
          <GraphCanvas
            graph={graph}
            colours={colours}
            margin={26}
            testId="overview-graph-canvas"
            onOpen={openTab}
            onRefocus={(path) => {
              void useGraphStore.getState().refocus(path);
              setOpen(true);
            }}
          />
        ) : (
          <p className={styles.empty}>
            {graph ? "Link two notes with [[wiki links]] and they will show up here." : "Drawing…"}
          </p>
        )}
      </div>
    </section>
  );
}
