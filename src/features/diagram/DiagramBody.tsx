/**
 * The drawing itself (WP-7.1) — one renderer, used twice.
 *
 * The editor mounts these components and the exported `.svg` is the very same tree run
 * through `renderToStaticMarkup`. That is deliberate: a separate export path is a second
 * implementation of the same picture, and the two would eventually disagree about something
 * small and nobody would notice until a compiled book looked wrong.
 *
 * SVG rather than canvas because a diagram is tens of shapes, not the thousand the link graph
 * paints — and because SVG is what has to come out at the end anyway.
 */

import type { Diagram, DiagramEdge, DiagramGroup, DiagramNode } from "./model";
import { centre } from "./model";
import {
  EDGE_TEXT,
  edgeGeometry,
  GROUP_TEXT,
  innerOutlineOf,
  isBare,
  LINE_HEIGHT,
  outlineOf,
  TEXT_SIZE,
  wrapText,
} from "./shapes";

/** Wrapped lines with keys of their own, so the list is not keyed by its index. */
function linesOf(text: string, width: number, size = TEXT_SIZE): { id: string; text: string }[] {
  return wrapText(text, width, size).map((line, i) => ({ id: `${i}-${line}`, text: line }));
}

interface TextProps {
  text: string;
  cx: number;
  cy: number;
  width: number;
  size?: number;
  weight?: number;
  fill?: string;
}

function Label({ text, cx, cy, width, size = TEXT_SIZE, weight = 510, fill }: TextProps) {
  if (!text.trim()) return null;
  const lines = linesOf(text, width, size);
  const height = size === TEXT_SIZE ? LINE_HEIGHT : size + 3;
  const top = cy - ((lines.length - 1) * height) / 2;
  return (
    <text
      x={cx}
      y={top}
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={size}
      fontWeight={weight}
      fill={fill ?? "var(--ink)"}
    >
      {lines.map((line, i) => (
        <tspan key={line.id} x={cx} dy={i === 0 ? 0 : height}>
          {line.text}
        </tspan>
      ))}
    </text>
  );
}

export function GroupPiece({ group }: { group: DiagramGroup }) {
  const c = centre(group);
  const common = {
    className: `t-${group.tone}`,
    fill: "var(--c)",
    fillOpacity: 0.06,
    stroke: "var(--c)",
    strokeOpacity: 0.5,
    strokeWidth: 1.4,
    strokeDasharray: "6 5",
  };
  return (
    <g>
      {group.shape === "circle" ? (
        <ellipse cx={c.x} cy={c.y} rx={group.w / 2} ry={group.h / 2} {...common} />
      ) : (
        <rect x={group.x} y={group.y} width={group.w} height={group.h} rx={18} {...common} />
      )}
      <g className={`t-${group.tone}`}>
        <Label
          text={group.text}
          cx={c.x}
          cy={group.y + 16}
          width={group.w - 24}
          size={GROUP_TEXT}
          weight={590}
          fill="var(--c)"
        />
      </g>
    </g>
  );
}

export function EdgePiece({
  edge,
  from,
  to,
}: {
  edge: DiagramEdge;
  from: DiagramNode;
  to: DiagramNode;
}) {
  const g = edgeGeometry(edge, from, to);
  const stroke = "var(--c)";
  return (
    <g className={`t-${edge.tone}`}>
      <path
        d={g.path}
        fill="none"
        stroke={stroke}
        strokeWidth={g.width}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={g.dashed ? "7 5" : undefined}
      />
      {g.twin ? (
        <path d={g.twin} fill="none" stroke={stroke} strokeWidth={g.width} strokeLinecap="round" />
      ) : null}
      {g.cut ? <path d={g.cut} fill="none" stroke={stroke} strokeWidth={1.8} /> : null}
      {g.heads.map((head) => (
        <path
          key={head.d}
          d={head.d}
          fill={head.filled ? stroke : "none"}
          stroke={stroke}
          strokeWidth={head.filled ? 0 : 2.2}
          strokeLinecap="round"
        />
      ))}
      {edge.label.trim() ? (
        <>
          <rect
            x={g.mid.x - (edge.label.length * EDGE_TEXT * 0.55) / 2 - 4}
            y={g.mid.y - EDGE_TEXT / 2 - 3}
            width={edge.label.length * EDGE_TEXT * 0.55 + 8}
            height={EDGE_TEXT + 6}
            rx={4}
            fill="var(--paper)"
          />
          <text
            x={g.mid.x}
            y={g.mid.y}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={EDGE_TEXT}
            fontWeight={590}
            fill={stroke}
          >
            {edge.label}
          </text>
        </>
      ) : null}
    </g>
  );
}

export function NodePiece({ node }: { node: DiagramNode }) {
  const c = centre(node);
  const inner = innerOutlineOf(node);
  const bare = isBare(node.kind);
  return (
    <g className={`t-${node.tone}`}>
      {bare ? null : (
        <path
          d={outlineOf(node)}
          fill="var(--c)"
          fillOpacity={0.12}
          stroke="var(--c)"
          strokeWidth={1.8}
          strokeLinejoin="round"
        />
      )}
      {inner ? (
        <path d={inner} fill="none" stroke="var(--c)" strokeWidth={1.4} strokeLinejoin="round" />
      ) : null}
      <Label
        text={node.text}
        cx={c.x}
        cy={c.y}
        width={node.w - (node.kind === "event" ? 40 : 18)}
        weight={bare ? 400 : 510}
      />
    </g>
  );
}

/**
 * Groups behind, then edges, then nodes: a line always passes under the boxes it joins, and
 * a group never covers what is standing inside it.
 */
export function DiagramBody({ diagram }: { diagram: Diagram }) {
  const byId = new Map(diagram.nodes.map((n) => [n.id, n]));
  return (
    <>
      {diagram.groups.map((g) => (
        <GroupPiece key={g.id} group={g} />
      ))}
      {diagram.edges.map((e) => {
        const from = byId.get(e.from);
        const to = byId.get(e.to);
        if (!from || !to) return null;
        return <EdgePiece key={e.id} edge={e} from={from} to={to} />;
      })}
      {diagram.nodes.map((n) => (
        <NodePiece key={n.id} node={n} />
      ))}
    </>
  );
}
