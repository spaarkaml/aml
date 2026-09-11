import { useTypesStore } from "./store";
import { TypeBadge } from "./TypeBadge";
import styles from "./TypesSettings.module.css";

/**
 * Note Types, in Settings (WP-3.3).
 *
 * There is no "new type" button, and that is the design: a type exists the moment a note or
 * a template says it does. What you do here is give the ones you have a colour and an icon —
 * so this is a list of what the Folio found, not a thing to be filled in first.
 */
export function TypesSettings() {
  const list = useTypesStore((s) => s.list);
  const save = useTypesStore((s) => s.save);

  if (list.length === 0) {
    return (
      <p className={styles.empty} data-testid="types-empty">
        No types yet. A note is a type the moment its properties say <code>type: chapter</code>, and
        a template that declares one makes a <em>New Chapter Note</em> command.
      </p>
    );
  }

  return (
    <ul className={styles.list} data-testid="types-list">
      {list.map((t) => (
        <li key={t.id} className={styles.row} data-testid={`type-${t.id}`}>
          <input
            type="color"
            className={styles.colour}
            value={t.colour}
            aria-label={`${t.name} colour`}
            data-testid={`type-colour-${t.id}`}
            onChange={(e) => void save({ ...t, colour: e.target.value.toLowerCase() })}
          />
          <input
            className={styles.icon}
            value={t.icon}
            maxLength={2}
            spellCheck={false}
            placeholder="—"
            aria-label={`${t.name} icon`}
            data-testid={`type-icon-${t.id}`}
            onChange={(e) => void save({ ...t, icon: e.target.value })}
          />
          <span className={styles.text}>
            <span className={styles.name}>{t.name}</span>
            <span className={styles.meta}>
              {t.template ? `New ${t.template} Note` : "no template"}
              {t.fields.length > 0 ? ` · ${t.fields.join(", ")}` : ""}
            </span>
          </span>
          <span className={styles.count}>
            {t.notes} {t.notes === 1 ? "note" : "notes"}
          </span>
          <TypeBadge type={t} />
        </li>
      ))}
    </ul>
  );
}
