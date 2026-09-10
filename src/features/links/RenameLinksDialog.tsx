import { noteTitle } from "@/lib/paths";
import styles from "./RenameLinksDialog.module.css";
import { useLinkStore } from "./store";

/** Asks whether a rename should rewrite the links that point at the moved note(s). */
export function RenameLinksDialog() {
  const pending = useLinkStore((s) => s.pendingRename);
  if (!pending) return null;
  const { preview, decide } = pending;
  const noteCount = preview.notes.length;
  return (
    <div className={styles.backdrop} data-testid="rename-links">
      <div className={styles.dialog} role="dialog" aria-labelledby="rename-links-title">
        <h2 id="rename-links-title" className={styles.title}>
          Update {preview.links} {preview.links === 1 ? "link" : "links"} in {noteCount}{" "}
          {noteCount === 1 ? "note" : "notes"}?
        </h2>
        <p className={styles.lead}>
          Renaming <strong>{noteTitle(preview.from)}</strong> to{" "}
          <strong>{noteTitle(preview.to)}</strong>.
        </p>
        <div className={styles.list}>
          {preview.notes.map((n) => (
            <section key={n.path} className={styles.note}>
              <h3 className={styles.notePath}>{n.newPath === n.path ? n.path : n.newPath}</h3>
              {n.edits.map((e) => (
                <div key={e.line} className={styles.edit}>
                  <span className={styles.line}>{e.line}</span>
                  <div className={styles.diff}>
                    <del>{e.before}</del>
                    <ins>{e.after}</ins>
                  </div>
                </div>
              ))}
            </section>
          ))}
        </div>
        <div className={styles.actions}>
          <button type="button" onClick={() => decide("cancel")}>
            Cancel
          </button>
          <button type="button" onClick={() => decide("skip")} data-testid="rename-only">
            Rename only
          </button>
          <button
            type="button"
            className={styles.primary}
            onClick={() => decide("update")}
            data-testid="rename-update"
          >
            Rename and update links
          </button>
        </div>
      </div>
    </div>
  );
}
