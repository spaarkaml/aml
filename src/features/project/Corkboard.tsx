import { type DragEvent, useEffect, useRef, useState } from "react";
import { useTabsStore } from "@/features/tabs/store";
import type { BinderItem } from "@/ipc";
import styles from "./Corkboard.module.css";
import { cardColour, groupsOf } from "./project";
import { type ColourBy, useProjectStore } from "./store";

const DRAG_TYPE = "application/x-aml-binder";

const COLOUR_BY: Array<{ id: ColourBy; label: string }> = [
  { id: "status", label: "Status" },
  { id: "label", label: "Label" },
  { id: "none", label: "None" },
];

/**
 * The Corkboard (WP-5.3): one card per document, grouped by part, in Binder order — moving a
 * card moves the document, because there is only one order and the Binder is it.
 *
 * A card's synopsis, label and status are the note's own front matter (ADR-004), so what is
 * typed here is legible in the file, in the Properties panel and to anything else that reads
 * markdown. The board holds nothing of its own.
 */
export function Corkboard() {
  const project = useProjectStore((s) => s.project);
  const colourBy = useProjectStore((s) => s.colourBy);
  const setColourBy = useProjectStore((s) => s.setColourBy);
  const groups = groupsOf(project);
  const values = new Set<string>();
  for (const g of groups)
    for (const i of g.items) {
      const v = (colourBy === "label" ? i.label : i.status).trim();
      if (v) values.add(v);
    }

  if (!project) return null;

  return (
    <div className={styles.board} data-testid="corkboard">
      <div className={styles.toolbar}>
        <span className={styles.toolbarLabel}>Colour by</span>
        <div className={styles.segmented}>
          {COLOUR_BY.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={colourBy === c.id}
              className={colourBy === c.id ? styles.segmentActive : styles.segment}
              onClick={() => setColourBy(c.id)}
              data-testid={`colour-by-${c.id}`}
            >
              {c.label}
            </button>
          ))}
        </div>
        {colourBy !== "none" && values.size > 0 ? (
          <ul className={styles.key} data-testid="corkboard-key">
            {[...values].sort().map((v) => (
              <li key={v}>
                <span
                  className={styles.keyDot}
                  style={{ background: cardColour(v) ?? undefined }}
                />
                {v}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {groups.length === 0 ? (
        <p className={styles.empty}>No documents in this Project yet.</p>
      ) : (
        groups.map((group, i) => (
          <section
            key={group.part?.rel ?? `loose-${i}`}
            className={styles.group}
            data-testid={`corkboard-group-${group.part?.rel ?? ""}`}
          >
            <h3 className={styles.partName}>
              {group.part ? group.part.name : "Before the first part"}
              <span className={styles.partWords}>
                {group.words.toLocaleString("en-AU")} {group.words === 1 ? "word" : "words"}
              </span>
            </h3>
            <ul className={styles.cards}>
              {group.items.map((item) => (
                <Card key={item.rel} item={item} colourBy={colourBy} />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function Card({ item, colourBy }: { item: BinderItem; colourBy: ColourBy }) {
  const openTab = useTabsStore((s) => s.open);
  const card = useProjectStore((s) => s.card);
  const drop = useProjectStore((s) => s.drop);
  const [over, setOver] = useState<"before" | "after" | null>(null);
  const tint = cardColour(
    colourBy === "label" ? item.label : colourBy === "status" ? item.status : "",
  );

  return (
    <li
      className={styles.card}
      style={tint ? { ["--card-tint" as string]: tint } : undefined}
      data-tinted={tint ? "" : undefined}
      data-out={item.include ? undefined : ""}
      data-over={over ?? undefined}
      data-testid={`card-${item.rel}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, item.rel);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e: DragEvent<HTMLLIElement>) => {
        if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
        e.preventDefault();
        const box = e.currentTarget.getBoundingClientRect();
        setOver(e.clientX - box.left < box.width / 2 ? "before" : "after");
      }}
      onDragLeave={() => setOver(null)}
      onDrop={(e) => {
        e.preventDefault();
        const from = e.dataTransfer.getData(DRAG_TYPE);
        const before = over === "before";
        setOver(null);
        if (from) void drop(from, item.rel, before);
      }}
    >
      <button
        type="button"
        className={styles.cardTitle}
        onClick={() => openTab(item.path)}
        title={`Open ${item.name}`}
      >
        {item.name}
      </button>
      <Synopsis item={item} onSave={(synopsis) => void card(item.path, { synopsis })} />
      <div className={styles.foot}>
        <Chip
          value={item.label}
          placeholder="Label"
          testId={`label-${item.rel}`}
          onSave={(label) => void card(item.path, { label })}
        />
        <Chip
          value={item.status}
          placeholder="Status"
          testId={`status-${item.rel}`}
          onSave={(status) => void card(item.path, { status })}
        />
        <span className={styles.words}>{item.words.toLocaleString("en-AU")}</span>
      </div>
    </li>
  );
}

/** The synopsis, saved when you leave the card — one write per edit, not per keystroke. */
function Synopsis({ item, onSave }: { item: BinderItem; onSave: (value: string) => void }) {
  const [value, setValue] = useState(item.synopsis);
  const dirty = useRef(false);

  // A card re-read from disk (a sync, another device) wins over what is not being typed.
  useEffect(() => {
    if (!dirty.current) setValue(item.synopsis);
  }, [item.synopsis]);

  return (
    <textarea
      className={styles.synopsis}
      value={value}
      placeholder="What happens here…"
      aria-label={`Synopsis of ${item.name}`}
      data-testid={`synopsis-${item.rel}`}
      onChange={(e) => {
        dirty.current = true;
        setValue(e.target.value);
      }}
      onBlur={() => {
        dirty.current = false;
        if (value !== item.synopsis) onSave(value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          dirty.current = false;
          setValue(item.synopsis);
          e.currentTarget.blur();
        }
      }}
    />
  );
}

function Chip({
  value,
  placeholder,
  testId,
  onSave,
}: {
  value: string;
  placeholder: string;
  testId: string;
  onSave: (value: string) => void;
}) {
  const [text, setText] = useState(value);
  const dirty = useRef(false);

  useEffect(() => {
    if (!dirty.current) setText(value);
  }, [value]);

  return (
    <input
      className={styles.chip}
      value={text}
      placeholder={placeholder}
      aria-label={placeholder}
      data-testid={testId}
      size={Math.max(placeholder.length, text.length || 1)}
      onChange={(e) => {
        dirty.current = true;
        setText(e.target.value);
      }}
      onBlur={() => {
        dirty.current = false;
        if (text !== value) onSave(text);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          dirty.current = false;
          setText(value);
          e.currentTarget.blur();
        }
      }}
    />
  );
}
