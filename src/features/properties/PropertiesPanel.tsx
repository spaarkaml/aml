import { useState } from "react";
import { Icon } from "@/app/icons";
import { getActiveEditor } from "@/features/editor/editorRef";
import { ALLOW_FRONT_MATTER_REMOVAL } from "@/features/editor/extensions/aml-nodes";
import { useEditorStore } from "@/features/editor/store";
import {
  coerce,
  display,
  type Field,
  parseFields,
  removeField,
  setField,
  toYaml,
} from "./frontmatter";
import styles from "./PropertiesPanel.module.css";

function currentYaml(): string {
  const doc = useEditorStore.getState().doc;
  const first = doc?.content[0];
  return first?.type === "frontMatter" ? String(first.attrs?.yaml ?? "") : "";
}

/** Writes the YAML into the front-matter node (creating or removing it as needed). */
function applyYaml(yaml: string): void {
  const editor = getActiveEditor();
  if (!editor) return;
  const { state } = editor;
  const first = state.doc.firstChild;
  const tr = state.tr.setMeta(ALLOW_FRONT_MATTER_REMOVAL, true);
  const type = state.schema.nodes.frontMatter;
  if (!type) return;
  if (first?.type.name === "frontMatter") {
    if (yaml === "") tr.delete(0, first.nodeSize);
    else tr.setNodeMarkup(0, type, { yaml });
  } else if (yaml !== "") {
    tr.insert(0, type.create({ yaml }));
  }
  editor.view.dispatch(tr);
}

export function PropertiesPanel() {
  const path = useEditorStore((s) => s.path);
  // Re-render on every document change so the fields stay current.
  useEditorStore((s) => s.doc);
  const [rawMode, setRawMode] = useState(false);
  const [newKey, setNewKey] = useState("");
  if (!path) return <p className={styles.empty}>Open a note to see its properties.</p>;

  const yaml = currentYaml();
  const fields = parseFields(yaml);
  const update = (next: Field[]) => applyYaml(toYaml(next));

  return (
    <div className={styles.panel} data-testid="properties-panel">
      {rawMode ? (
        <textarea
          className={styles.raw}
          defaultValue={yaml}
          aria-label="Front matter YAML"
          onBlur={(e) => applyYaml(e.target.value.replace(/\n+$/, ""))}
        />
      ) : (
        <dl className={styles.list}>
          {fields.map((f) => (
            <div className={styles.row} key={f.key}>
              <dt className={styles.key}>{f.key}</dt>
              <dd className={styles.value}>
                {f.kind === "boolean" ? (
                  <input
                    type="checkbox"
                    checked={f.value === true}
                    aria-label={f.key}
                    onChange={(e) => update(setField(fields, f.key, e.target.checked))}
                  />
                ) : (
                  <input
                    className={styles.input}
                    defaultValue={display(f)}
                    aria-label={f.key}
                    onBlur={(e) => {
                      const v = coerce(f.kind, e.target.value);
                      if (display({ ...f, value: v }) !== display(f))
                        update(setField(fields, f.key, v));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                  />
                )}
                <button
                  type="button"
                  className={styles.remove}
                  aria-label={`Remove ${f.key}`}
                  onClick={() => update(removeField(fields, f.key))}
                >
                  <Icon name="close" size={12} />
                </button>
              </dd>
            </div>
          ))}
        </dl>
      )}
      <form
        className={styles.add}
        onSubmit={(e) => {
          e.preventDefault();
          const key = newKey.trim();
          if (!key || fields.some((f) => f.key === key)) return;
          update(setField(fields, key, ""));
          setNewKey("");
        }}
      >
        <input
          className={styles.input}
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          placeholder="Add property…"
          aria-label="New property name"
        />
        <button type="submit" className={styles.small}>
          Add
        </button>
        <button type="button" className={styles.small} onClick={() => setRawMode((m) => !m)}>
          {rawMode ? "Fields" : "YAML"}
        </button>
      </form>
    </div>
  );
}
