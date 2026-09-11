import { useState } from "react";
import { Icon } from "@/app/icons";
import { useEditorStore } from "@/features/editor/store";
import { useTypesStore } from "@/features/types/store";
import { TypeBadge } from "@/features/types/TypeBadge";
import { applyYaml, currentYaml } from "./edit";
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

/**
 * The note's type, and the fields that type expects (WP-3.3).
 *
 * `type:` is an ordinary front-matter field — it is still written into the note as one, and
 * the list below still shows it. What this adds is a picker over the types the Folio already
 * knows, so the value is one you can search for rather than one you have to remember how to
 * spell, and a row of the properties this type's template declares but this note is missing.
 */
function TypeRow({ fields, update }: { fields: Field[]; update: (next: Field[]) => void }) {
  const list = useTypesStore((s) => s.list);
  const find = useTypesStore((s) => s.find);
  const raw = fields.find((f) => f.key === "type")?.value;
  const current = find(typeof raw === "string" ? raw : null);
  const missing = (current?.fields ?? []).filter((k) => !fields.some((f) => f.key === k));

  return (
    <section className={styles.type} data-testid="type-row">
      <div className={styles.typePick}>
        <TypeBadge type={current} />
        <select
          className={styles.select}
          value={current?.id ?? (typeof raw === "string" ? raw : "")}
          aria-label="Note type"
          data-testid="type-select"
          onChange={(e) => {
            const id = e.target.value;
            update(id ? setField(fields, "type", id) : removeField(fields, "type"));
          }}
        >
          <option value="">No type</option>
          {/* A hand-typed type the Folio has never seen is still offered, so choosing
              another does not silently look like the note never had one. */}
          {!current && typeof raw === "string" && raw ? <option value={raw}>{raw}</option> : null}
          {list.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      {missing.length > 0 ? (
        <p className={styles.missing} data-testid="type-fields">
          <span className={styles.missingLabel}>Add:</span>
          {missing.map((key) => (
            <button
              key={key}
              type="button"
              className={styles.fieldButton}
              onClick={() => update(setField(fields, key, ""))}
              data-testid={`type-field-${key}`}
            >
              {key}
            </button>
          ))}
        </p>
      ) : null}
    </section>
  );
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
      {rawMode ? null : <TypeRow fields={fields} update={update} />}
      {rawMode ? (
        <textarea
          className={styles.raw}
          defaultValue={yaml}
          aria-label="Front matter YAML"
          onBlur={(e) => applyYaml(e.target.value.replace(/\n+$/, ""))}
        />
      ) : (
        <dl className={styles.list}>
          {/* `type` is a field like any other and the YAML view shows it, but the picker
              above is a better editor for it than a text box, so it is not listed twice. */}
          {fields
            .filter((f) => f.key !== "type")
            .map((f) => (
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
        <button
          type="button"
          className={styles.small}
          onClick={() => setRawMode((m) => !m)}
          data-testid="properties-raw"
        >
          {rawMode ? "Fields" : "YAML"}
        </button>
      </form>
    </div>
  );
}
