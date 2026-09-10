import { BacklinksPanel } from "@/features/links/BacklinksPanel";
import { PropertiesPanel } from "@/features/properties/PropertiesPanel";
import styles from "./shell.module.css";

/** Right-hand panel: everything about the open note that is not its text. */
export function ContextPanel() {
  return (
    <div className={styles.context}>
      <details open className={styles.section} data-testid="context-properties">
        <summary className={styles.sectionTitle}>Properties</summary>
        <PropertiesPanel />
      </details>
      <details open className={styles.section} data-testid="context-backlinks">
        <summary className={styles.sectionTitle}>Backlinks</summary>
        <BacklinksPanel />
      </details>
    </div>
  );
}
