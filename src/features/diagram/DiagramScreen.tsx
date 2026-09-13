import { useEffect } from "react";
import { Icon } from "@/app/icons";
import { getActiveEditor } from "@/features/editor/editorRef";
import styles from "./DiagramScreen.module.css";
import { DiagramStage } from "./DiagramStage";
import {
  EDGE_LABELS,
  type EdgeKind,
  type GroupShape,
  KINDS,
  type NodeKind,
  TONE_HEX,
  TONES,
  type Tone,
} from "./model";
import { outlineOf } from "./shapes";
import { useDiagramStore } from "./store";

const FAMILIES: ("People" | "Mind" | "World")[] = ["People", "Mind", "World"];
const EDGE_KINDS = Object.keys(EDGE_LABELS) as EdgeKind[];

/** The palette button's picture is the shape itself, drawn by the code that draws the real one. */
function KindGlyph({ kind }: { kind: NodeKind }) {
  const node = { id: "g", kind, x: 2, y: 2, w: 22, h: 14, tone: "neutral" as Tone, text: "" };
  return (
    <svg className={styles.glyph} viewBox="0 0 26 18" aria-hidden="true">
      <path
        d={outlineOf(node)}
        fill="currentColor"
        fillOpacity={0.18}
        stroke="currentColor"
        strokeWidth={1.2}
      />
    </svg>
  );
}

function ToneSwatches({ value, onPick }: { value: Tone; onPick: (tone: Tone) => void }) {
  return (
    <div className={styles.swatches}>
      {TONES.map((tone) => (
        <button
          key={tone}
          type="button"
          title={tone}
          aria-label={tone}
          aria-pressed={value === tone}
          className={value === tone ? styles.swatchOn : styles.swatch}
          style={{ background: tone === "neutral" ? "var(--aml-text-3)" : TONE_HEX[tone] }}
          onClick={() => onPick(tone)}
        />
      ))}
    </div>
  );
}

/**
 * The diagram editor (WP-7.1).
 *
 * What it produces is an ordinary `.svg` in the note's assets folder, referenced by an
 * ordinary image link — so a diagram is readable everywhere your notes are, and re-editable
 * here because the file carries its own model. See `docs/specs/WP-7.1-diagrams.md`.
 */
export function DiagramScreen() {
  const open = useDiagramStore((s) => s.open);
  const doc = useDiagramStore((s) => s.doc);
  const tool = useDiagramStore((s) => s.tool);
  const selection = useDiagramStore((s) => s.selection);
  const target = useDiagramStore((s) => s.target);
  const saving = useDiagramStore((s) => s.saving);
  const error = useDiagramStore((s) => s.error);
  const dirty = useDiagramStore((s) => s.dirty);
  const setTool = useDiagramStore((s) => s.setTool);
  const close = useDiagramStore((s) => s.close);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const s = useDiagramStore.getState();
      const typing =
        e.target instanceof HTMLElement &&
        (e.target.tagName === "INPUT" ||
          e.target.tagName === "TEXTAREA" ||
          e.target.tagName === "SELECT");
      if (e.key === "Escape") {
        if (s.linking) s.setLinking(null);
        else if (s.tool !== "select") s.setTool("select");
        else close();
        return;
      }
      if (!typing && (e.key === "Backspace" || e.key === "Delete")) {
        e.preventDefault();
        s.removeSelected();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open) return null;

  const node =
    selection?.kind === "node" ? doc.nodes.find((n) => n.id === selection.id) : undefined;
  const edge =
    selection?.kind === "edge" ? doc.edges.find((e) => e.id === selection.id) : undefined;
  const group =
    selection?.kind === "group" ? doc.groups.find((g) => g.id === selection.id) : undefined;

  const onSave = async () => {
    const s = useDiagramStore.getState();
    const result = await s.save();
    if (!result) return;
    // A diagram that is already in the note only needs writing; a new one needs putting there.
    if (result.fresh) {
      const editor = getActiveEditor();
      editor
        ?.chain()
        .focus()
        .setImage({ src: result.markdownPath, alt: doc.nodes[0]?.text ?? "Diagram" })
        .run();
    }
    s.close();
  };

  return (
    <div className={styles.backdrop} data-testid="diagram-backdrop">
      <button
        type="button"
        className={styles.backdropButton}
        onMouseDown={close}
        tabIndex={-1}
        aria-label="Close the diagram editor"
      />
      <div className={styles.panel} role="dialog" aria-label="Diagram editor">
        <div className={styles.head}>
          <h2>{target?.assetPath ? "Edit diagram" : "New diagram"}</h2>
          <div className={styles.spacer} />
          {error ? <span className={styles.error}>{error}</span> : null}
          <button
            type="button"
            className={styles.ghost}
            onClick={() => useDiagramStore.getState().fitToDrawing()}
          >
            Fit to drawing
          </button>
          <button
            type="button"
            className={styles.primary}
            disabled={saving}
            onClick={() => void onSave()}
            data-testid="diagram-save"
          >
            {target?.assetPath ? "Save" : "Insert"}
          </button>
          <button type="button" className={styles.close} onClick={close} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.rail}>
            {FAMILIES.map((family) => (
              <div key={family} className={styles.railGroup}>
                <p className={styles.railTitle}>{family}</p>
                {(Object.keys(KINDS) as NodeKind[])
                  .filter((k) => KINDS[k].family === family)
                  .map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      className={tool === kind ? styles.toolActive : styles.tool}
                      aria-pressed={tool === kind}
                      onClick={() => setTool(tool === kind ? "select" : kind)}
                      data-testid={`diagram-tool-${kind}`}
                    >
                      <KindGlyph kind={kind} />
                      {KINDS[kind].label}
                    </button>
                  ))}
              </div>
            ))}
            <div className={styles.railGroup}>
              <p className={styles.railTitle}>Grouping</p>
              {(["circle", "rect"] as GroupShape[]).map((shape) => (
                <button
                  key={shape}
                  type="button"
                  className={styles.tool}
                  onClick={() => {
                    const s = useDiagramStore.getState();
                    s.placeGroup(shape, s.doc.width / 2, s.doc.height / 2);
                  }}
                  data-testid={`diagram-group-${shape}`}
                >
                  <svg className={styles.glyph} viewBox="0 0 26 18" aria-hidden="true">
                    {shape === "circle" ? (
                      <ellipse
                        cx={13}
                        cy={9}
                        rx={11}
                        ry={7}
                        fill="none"
                        stroke="currentColor"
                        strokeDasharray="3 2"
                      />
                    ) : (
                      <rect
                        x={2}
                        y={2}
                        width={22}
                        height={14}
                        rx={4}
                        fill="none"
                        stroke="currentColor"
                        strokeDasharray="3 2"
                      />
                    )}
                  </svg>
                  {shape === "circle" ? "Circle" : "Box"}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.stage}>
            <DiagramStage />
          </div>

          <div className={styles.inspector}>
            {node ? (
              <>
                <div className={styles.field}>
                  <label htmlFor="diagram-text">Text</label>
                  <textarea
                    id="diagram-text"
                    data-diagram-text
                    value={node.text}
                    onChange={(e) =>
                      useDiagramStore.getState().patchNode(node.id, { text: e.target.value })
                    }
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor="diagram-kind">Kind</label>
                  <select
                    id="diagram-kind"
                    value={node.kind}
                    onChange={(e) =>
                      useDiagramStore
                        .getState()
                        .patchNode(node.id, { kind: e.target.value as NodeKind })
                    }
                  >
                    {(Object.keys(KINDS) as NodeKind[]).map((k) => (
                      <option key={k} value={k}>
                        {KINDS[k].label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={styles.field}>
                  <span>Colour</span>
                  <ToneSwatches
                    value={node.tone}
                    onPick={(tone) => useDiagramStore.getState().patchNode(node.id, { tone })}
                  />
                </div>
                <button
                  type="button"
                  className={styles.danger}
                  onClick={() => useDiagramStore.getState().removeSelected()}
                >
                  Delete
                </button>
              </>
            ) : null}

            {edge ? (
              <>
                <div className={styles.field}>
                  <label htmlFor="diagram-edge-kind">Link</label>
                  <select
                    id="diagram-edge-kind"
                    value={edge.kind}
                    onChange={(e) =>
                      useDiagramStore
                        .getState()
                        .patchEdge(edge.id, { kind: e.target.value as EdgeKind })
                    }
                  >
                    {EDGE_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {EDGE_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={styles.field}>
                  <label htmlFor="diagram-edge-label">Label</label>
                  <input
                    id="diagram-edge-label"
                    data-diagram-text
                    value={edge.label}
                    placeholder="+ or −"
                    onChange={(e) =>
                      useDiagramStore.getState().patchEdge(edge.id, { label: e.target.value })
                    }
                  />
                </div>
                <div className={styles.field}>
                  <span>Colour</span>
                  <ToneSwatches
                    value={edge.tone}
                    onPick={(tone) => useDiagramStore.getState().patchEdge(edge.id, { tone })}
                  />
                </div>
                <button
                  type="button"
                  className={styles.danger}
                  onClick={() => useDiagramStore.getState().removeSelected()}
                >
                  Delete
                </button>
              </>
            ) : null}

            {group ? (
              <>
                <div className={styles.field}>
                  <label htmlFor="diagram-group-text">Name</label>
                  <input
                    id="diagram-group-text"
                    data-diagram-text
                    value={group.text}
                    onChange={(e) =>
                      useDiagramStore.getState().patchGroup(group.id, { text: e.target.value })
                    }
                  />
                </div>
                <div className={styles.field}>
                  <span>Colour</span>
                  <ToneSwatches
                    value={group.tone}
                    onPick={(tone) => useDiagramStore.getState().patchGroup(group.id, { tone })}
                  />
                </div>
                <button
                  type="button"
                  className={styles.danger}
                  onClick={() => useDiagramStore.getState().removeSelected()}
                >
                  Delete
                </button>
              </>
            ) : null}

            {!node && !edge && !group ? (
              <p className={styles.empty}>
                Pick a shape on the left, then click the page to place it. Select something to join
                it to another: drag from one of the four dots onto the shape it acts on.
              </p>
            ) : null}
          </div>
        </div>

        <div className={styles.foot}>
          <span>
            {doc.nodes.length} {doc.nodes.length === 1 ? "shape" : "shapes"}, {doc.edges.length}{" "}
            {doc.edges.length === 1 ? "link" : "links"}
          </span>
          <span>{dirty ? "Unsaved" : "Saved"}</span>
          <div className={styles.spacer} />
          <span>Scroll to zoom · drag the page to move it · ⌘Z undoes</span>
        </div>
      </div>
    </div>
  );
}
