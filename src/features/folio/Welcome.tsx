import { useSyncStore } from "@/features/sync/store";
import { useFolioStore } from "./store";
import styles from "./Welcome.module.css";

export function Welcome() {
  const recent = useFolioStore((s) => s.recent);
  const busy = useFolioStore((s) => s.busy);
  const error = useFolioStore((s) => s.error);
  const pendingCreate = useFolioStore((s) => s.pendingCreate);
  const pickAndOpen = useFolioStore((s) => s.pickAndOpen);
  const pickAndCreate = useFolioStore((s) => s.pickAndCreate);
  const openPath = useFolioStore((s) => s.openPath);
  const createAt = useFolioStore((s) => s.createAt);
  const openSync = useSyncStore((s) => s.setOpen);

  return (
    <section className={styles.welcome} aria-label="Welcome">
      <h1 className={styles.wordmark}>AML</h1>
      <p className={styles.tagline}>Open a Folio to start writing.</p>
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={pickAndOpen} disabled={busy}>
          Open Folio…
        </button>
        <button type="button" className={styles.secondary} onClick={pickAndCreate} disabled={busy}>
          Create Folio…
        </button>
        <button
          type="button"
          className={styles.secondary}
          onClick={() => openSync(true)}
          data-testid="welcome-sync"
        >
          NAS sync…
        </button>
      </div>
      {error ? (
        <div className={styles.error} role="alert">
          <span>{error}</span>
          {pendingCreate ? (
            <button
              type="button"
              className={styles.secondary}
              onClick={() => createAt(pendingCreate)}
              disabled={busy}
            >
              Make it a Folio
            </button>
          ) : null}
        </div>
      ) : null}
      {recent.length > 0 ? (
        <div className={styles.recent}>
          <h2 className={styles.recentHeading}>Recent</h2>
          <ul className={styles.recentList}>
            {recent.map((r) => (
              <li key={r.path}>
                <button
                  type="button"
                  className={styles.recentItem}
                  onClick={() => openPath(r.path)}
                  disabled={busy}
                >
                  <span className={styles.recentName}>{r.name}</span>
                  <span className={styles.recentPath}>{r.path}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
