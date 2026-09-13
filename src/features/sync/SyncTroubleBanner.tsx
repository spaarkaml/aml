import { useFolioStore } from "@/features/folio/store";
import styles from "./SyncTroubleBanner.module.css";
import { syncTrouble, useSyncStore } from "./store";

/**
 * The one sync problem worth interrupting for (WP-4.3): a sync that looks like it is working
 * and never finishes. Being offline never raises this — the status bar says so, and
 * travelling is normal.
 */
export function SyncTroubleBanner() {
  const status = useSyncStore((s) => s.status);
  const progress = useSyncStore((s) => s.progress);
  const dismissed = useSyncStore((s) => s.dismissedTrouble);
  const root = useFolioStore((s) => s.folio?.root ?? null);
  const trouble = syncTrouble(status, root, progress);
  if (!trouble || trouble.key === dismissed) return null;

  const { dismissTrouble, openGui, setOpen } = useSyncStore.getState();
  return (
    <div className={styles.banner} role="alert" data-testid="sync-trouble">
      {trouble.kind === "failures" ? (
        <div className={styles.text}>
          <strong>“{trouble.folder}” cannot finish syncing.</strong>{" "}
          {trouble.failures.length === 1
            ? "One file could not be updated:"
            : `${trouble.failures.length} files could not be updated, including:`}
          <ul className={styles.files}>
            {trouble.failures.slice(0, 3).map((f) => (
              <li key={f.path}>
                <code>{f.path}</code> — {f.error}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className={styles.text}>
          <strong>“{trouble.folder}” has stopped syncing.</strong> The NAS is connected, but nothing
          has moved for {trouble.minutes} minutes
          {trouble.items > 0 ? ` with ${trouble.items} items still to go` : ""}. Your notes are safe
          on this computer.
        </p>
      )}
      <div className={styles.actions}>
        <button type="button" onClick={() => setOpen(true)}>
          NAS sync
        </button>
        <button type="button" onClick={() => void openGui()}>
          Open Syncthing
        </button>
        <button type="button" onClick={() => dismissTrouble(trouble.key)}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
