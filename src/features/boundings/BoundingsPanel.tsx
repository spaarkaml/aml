import { useState } from "react";
import { useEditorStore } from "@/features/editor/store";
import { openNoteAt } from "@/features/quickopen/store";
import type { Bounding } from "@/ipc";
import { baseName, parentDir } from "@/lib/paths";
import styles from "./BoundingsPanel.module.css";
import { BOUNDING_COLOURS, useBoundingsStore } from "./store";

interface Draft {
  name: string;
  colour: string;
  icon: string;
}

/** Name, icon and colour for one Bounding — or for one that does not exist yet. */
function Editor({
  initial,
  testId,
  onSave,
  onCancel,
  onDelete,
}: {
  initial: Draft;
  testId: string;
  onSave: (draft: Draft) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [confirming, setConfirming] = useState(false);

  return (
    <form
      className={styles.editor}
      data-testid={testId}
      onSubmit={(e) => {
        e.preventDefault();
        if (draft.name.trim()) onSave(draft);
      }}
    >
      <div className={styles.fields}>
        <input
          className={styles.icon}
          value={draft.icon}
          onChange={(e) => setDraft({ ...draft, icon: e.target.value })}
          aria-label="Icon"
          maxLength={2}
          data-testid="bounding-icon"
        />
        <input
          // The editor is opened deliberately, so the name is where the caret belongs.
          ref={(el) => el?.focus()}
          className={styles.name}
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Escape") onCancel();
          }}
          placeholder="Name this Bounding"
          aria-label="Bounding name"
          data-testid="bounding-name"
        />
      </div>
      <div className={styles.swatches}>
        {BOUNDING_COLOURS.map((c) => (
          <button
            key={c}
            type="button"
            className={c === draft.colour ? styles.swatchOn : styles.swatch}
            style={{ background: c }}
            aria-label={`Colour ${c}`}
            aria-pressed={c === draft.colour}
            onClick={() => setDraft({ ...draft, colour: c })}
          />
        ))}
      </div>
      <div className={styles.actions}>
        <button type="submit" className={styles.small} data-testid="bounding-save">
          Save
        </button>
        <button type="button" className={styles.small} onClick={onCancel}>
          Cancel
        </button>
        {onDelete ? (
          <button
            type="button"
            className={styles.danger}
            data-testid="bounding-delete"
            onClick={() => {
              if (confirming) onDelete();
              else setConfirming(true);
            }}
          >
            {confirming ? "Really delete?" : "Delete"}
          </button>
        ) : null}
      </div>
    </form>
  );
}

/** Boundings: virtual groups of notes, many-to-many, kept in the Folio (WP-2.8). */
export function BoundingsPanel() {
  const list = useBoundingsStore((s) => s.list);
  const selected = useBoundingsStore((s) => s.selected);
  const editing = useBoundingsStore((s) => s.editing);
  const draft = useBoundingsStore((s) => s.draft);
  const error = useBoundingsStore((s) => s.error);
  const create = useBoundingsStore((s) => s.create);
  const update = useBoundingsStore((s) => s.update);
  const remove = useBoundingsStore((s) => s.remove);
  const startDraft = useBoundingsStore((s) => s.startDraft);
  const cancelDraft = useBoundingsStore((s) => s.cancelDraft);
  const select = useBoundingsStore((s) => s.select);
  const edit = useBoundingsStore((s) => s.edit);
  const add = useBoundingsStore((s) => s.add);
  const take = useBoundingsStore((s) => s.take);
  const notePath = useEditorStore((s) => s.path);

  const used = list.map((b) => b.colour);
  const nextColour = BOUNDING_COLOURS.find((c) => !used.includes(c)) ?? BOUNDING_COLOURS[0] ?? "";

  return (
    <div className={styles.panel} data-testid="boundings-panel">
      <div className={styles.head}>
        <span className={styles.title}>Boundings</span>
        <button
          type="button"
          className={styles.small}
          onClick={startDraft}
          data-testid="bounding-new"
        >
          + New
        </button>
      </div>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {draft ? (
        <Editor
          initial={{ name: "", colour: nextColour, icon: "" }}
          testId="bounding-editor-draft"
          onSave={(d) => void create(d.name, { colour: d.colour, icon: d.icon })}
          onCancel={cancelDraft}
        />
      ) : null}
      {list.length === 0 && !draft ? (
        <p className={styles.empty}>
          No Boundings yet. They group notes across folders — a note can be in as many as you like.
        </p>
      ) : null}

      <ul className={styles.list} data-testid="boundings-list">
        {list.map((b: Bounding) => {
          const holds = notePath ? b.notes.includes(notePath) : false;
          return (
            <li key={b.id} className={styles.item}>
              <div className={styles.row}>
                <button
                  type="button"
                  className={b.id === selected ? styles.boundingOn : styles.bounding}
                  onClick={() => select(b.id)}
                  aria-expanded={b.id === selected}
                  data-testid={`bounding-${b.id}`}
                >
                  <span className={styles.dot} style={{ background: b.colour }} aria-hidden />
                  <span className={styles.label}>
                    {b.icon ? <span className={styles.emoji}>{b.icon}</span> : null}
                    {b.name}
                  </span>
                  <span className={styles.count}>{b.notes.length}</span>
                </button>
                {notePath ? (
                  <button
                    type="button"
                    className={styles.toggle}
                    title={holds ? "Remove the open note" : "Add the open note"}
                    aria-label={
                      holds ? `Remove this note from ${b.name}` : `Add this note to ${b.name}`
                    }
                    data-testid={`bounding-toggle-${b.id}`}
                    onClick={() => void (holds ? take(b.id) : add(b.id))}
                  >
                    {holds ? "−" : "+"}
                  </button>
                ) : null}
                <button
                  type="button"
                  className={styles.toggle}
                  title="Edit this Bounding"
                  aria-label={`Edit ${b.name}`}
                  data-testid={`bounding-edit-${b.id}`}
                  onClick={() => edit(editing === b.id ? null : b.id)}
                >
                  ✎
                </button>
              </div>
              {editing === b.id ? (
                <Editor
                  initial={{ name: b.name, colour: b.colour, icon: b.icon }}
                  testId={`bounding-editor-${b.id}`}
                  onSave={(d) => {
                    void update(b.id, d);
                    edit(null);
                  }}
                  onCancel={() => edit(null)}
                  onDelete={() => void remove(b.id)}
                />
              ) : null}
              {selected === b.id ? (
                <ul className={styles.notes} data-testid={`bounding-notes-${b.id}`}>
                  {b.notes.length === 0 ? (
                    <li className={styles.empty}>
                      Nothing in this Bounding yet. Open a note and press +.
                    </li>
                  ) : null}
                  {b.notes.map((path) => (
                    <li key={path}>
                      <button
                        type="button"
                        className={styles.note}
                        onClick={() => openNoteAt(path, null)}
                        title={path}
                      >
                        <span className={styles.label}>{baseName(path).replace(/\.md$/i, "")}</span>
                        <span className={styles.folder}>{parentDir(path) || "/"}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
