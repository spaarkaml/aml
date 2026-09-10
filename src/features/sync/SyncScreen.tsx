import { useEffect, useState } from "react";
import { useFolioStore } from "@/features/folio/store";
import styles from "./SyncScreen.module.css";
import { startSyncPolling, syncedFolderFor, useSyncStore } from "./store";

/**
 * One-time pairing with the NAS and ongoing sync overview (ADR-005). Opened from the Welcome
 * screen, the palette or the status bar. Everything here talks to the sidecar through Rust.
 */
export function SyncScreen() {
  const open = useSyncStore((s) => s.open);
  const setOpen = useSyncStore((s) => s.setOpen);
  const status = useSyncStore((s) => s.status);
  const busy = useSyncStore((s) => s.busy);
  const error = useSyncStore((s) => s.error);
  const enable = useSyncStore((s) => s.enable);
  const disable = useSyncStore((s) => s.disable);
  const addDevice = useSyncStore((s) => s.addDevice);
  const removeDevice = useSyncStore((s) => s.removeDevice);
  const acceptPending = useSyncStore((s) => s.acceptPending);
  const shareFolio = useSyncStore((s) => s.shareFolio);
  const log = useSyncStore((s) => s.log);
  const loadLog = useSyncStore((s) => s.loadLog);
  const folio = useFolioStore((s) => s.folio);
  const openPath = useFolioStore((s) => s.openPath);
  const createAt = useFolioStore((s) => s.createAt);

  const [deviceId, setDeviceId] = useState("");
  const [name, setName] = useState("NAS");
  const [address, setAddress] = useState("");
  const [copied, setCopied] = useState(false);
  const [showLog, setShowLog] = useState(false);

  useEffect(() => {
    if (!open) return;
    const stop = startSyncPolling();
    return stop;
  }, [open]);

  useEffect(() => {
    if (open && showLog) void loadLog();
  }, [open, showLog, loadLog]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open) return null;

  const running = status?.running ?? false;
  const nas = status?.devices[0] ?? null;
  const folioFolder = syncedFolderFor(status, folio?.root ?? null);

  const copyId = async () => {
    if (!status?.myId) return;
    try {
      await navigator.clipboard.writeText(status.myId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable: the ID is still selectable */
    }
  };

  const submitDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await addDevice(deviceId, name, address)) setDeviceId("");
  };

  const openFolder = async (path: string) => {
    const ok = await openPath(path);
    if (!ok && useFolioStore.getState().pendingCreate === path) await createAt(path);
    if (useFolioStore.getState().folio) setOpen(false);
  };

  return (
    <div className={styles.backdrop} data-testid="sync-screen">
      <button
        type="button"
        className={styles.backdropButton}
        onMouseDown={() => setOpen(false)}
        tabIndex={-1}
        aria-label="Close sync settings"
      />
      <div className={styles.panel} role="dialog" aria-label="NAS sync">
        <header className={styles.header}>
          <h2>NAS sync</h2>
          <button
            type="button"
            className={styles.close}
            onClick={() => setOpen(false)}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <section className={styles.step}>
          <h3>1 · Sync engine on this computer</h3>
          <p className={styles.muted}>
            AML runs a bundled copy of Syncthing in the background. Nothing leaves your home
            network: relays and global discovery are off.
          </p>
          <div className={styles.row}>
            <span className={running ? styles.ok : styles.warn} data-testid="sync-engine-state">
              {running
                ? `Running${status?.version ? ` · ${status.version}` : ""}`
                : status?.enabled
                  ? "Starting…"
                  : "Off"}
            </span>
            {status?.enabled ? (
              <button
                type="button"
                className={styles.secondary}
                onClick={() => void disable()}
                disabled={busy}
              >
                Turn off
              </button>
            ) : (
              <button
                type="button"
                className={styles.primary}
                onClick={() => void enable()}
                disabled={busy}
                data-testid="sync-enable"
              >
                Turn on
              </button>
            )}
          </div>
          {status?.myId ? (
            <div className={styles.idBox}>
              <span className={styles.muted}>
                This computer's Device ID (add it on the NAS if it asks):
              </span>
              <code className={styles.deviceId} data-testid="my-device-id">
                {status.myId}
              </code>
              <button type="button" className={styles.secondary} onClick={() => void copyId()}>
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          ) : null}
        </section>

        <section className={styles.step}>
          <h3>2 · The NAS</h3>
          {nas ? (
            <div className={styles.row}>
              <span className={nas.connected ? styles.ok : styles.warn} data-testid="nas-state">
                {nas.name} · {nas.connected ? `connected (${nas.address})` : "not connected yet"}
              </span>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => void removeDevice(nas.id)}
                disabled={busy}
              >
                Forget
              </button>
            </div>
          ) : (
            <form className={styles.form} onSubmit={(e) => void submitDevice(e)}>
              <p className={styles.muted}>
                Paste the NAS's Device ID (Syncthing on the NAS → Actions → Show ID). Then, on the
                NAS, accept the new device when it appears.
              </p>
              <label>
                Device ID
                <input
                  value={deviceId}
                  onChange={(e) => setDeviceId(e.target.value)}
                  placeholder="ABCDEFG-HIJKLMN-…"
                  spellCheck={false}
                  data-testid="nas-device-id"
                  required
                />
              </label>
              <div className={styles.two}>
                <label>
                  Name
                  <input value={name} onChange={(e) => setName(e.target.value)} />
                </label>
                <label>
                  Address (optional)
                  <input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="192.168.1.20"
                    data-testid="nas-address"
                  />
                </label>
              </div>
              <button
                type="submit"
                className={styles.primary}
                disabled={busy || !deviceId.trim()}
                data-testid="nas-add"
              >
                Add NAS
              </button>
            </form>
          )}
        </section>

        <section className={styles.step}>
          <h3>3 · Folders</h3>
          {status?.pending.length ? (
            <ul className={styles.list} data-testid="pending-folders">
              {status.pending.map((p) => (
                <li key={`${p.id}:${p.offeredBy}`} className={styles.row}>
                  <span>
                    <strong>{p.label}</strong>{" "}
                    <span className={styles.muted}>offered by {p.offeredByName}</span>
                  </span>
                  <button
                    type="button"
                    className={styles.primary}
                    disabled={busy}
                    onClick={() => void acceptPending(p.id, p.label, p.offeredBy)}
                  >
                    Accept → choose folder…
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {status?.folders.length ? (
            <ul className={styles.list} data-testid="synced-folders">
              {status.folders.map((f) => (
                <li key={f.id} className={styles.row}>
                  <span>
                    <strong>{f.label}</strong> <span className={styles.muted}>{f.path}</span>
                    <br />
                    <span className={f.error ? styles.warn : styles.muted}>
                      {f.error ??
                        `${f.state}${(f.completion ?? 100) < 100 ? ` · ${Math.floor(f.completion ?? 0)}%` : ""}`}
                    </span>
                  </span>
                  {folio?.root === f.path ? (
                    <span className={styles.ok}>Open</span>
                  ) : (
                    <button
                      type="button"
                      className={styles.secondary}
                      onClick={() => void openFolder(f.path)}
                      disabled={busy}
                    >
                      Open as Folio
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
          {folio && nas && !folioFolder ? (
            <div className={styles.row}>
              <span className={styles.muted}>
                “{folio.name}” is not synced yet. Share it with the NAS, then accept it there.
              </span>
              <button
                type="button"
                className={styles.primary}
                disabled={busy}
                onClick={() => void shareFolio(folio.root, nas.id)}
                data-testid="share-folio"
              >
                Share this Folio with the NAS
              </button>
            </div>
          ) : null}
          {!status?.pending.length && !status?.folders.length && !folio ? (
            <p className={styles.muted}>
              Once the NAS is connected, either share a folder from the NAS's Syncthing to this
              computer (it appears here to accept), or open a Folio and share it from here.
            </p>
          ) : null}
        </section>

        {error ? (
          <div className={styles.error} role="alert">
            {error}
          </div>
        ) : null}
        {status?.error ? (
          <div className={styles.error} role="alert">
            {status.error}
          </div>
        ) : null}

        <footer className={styles.footer}>
          <button type="button" className={styles.link} onClick={() => setShowLog((v) => !v)}>
            {showLog ? "Hide log" : "Show sync log"}
          </button>
          {status?.running ? (
            <span className={styles.muted}>Advanced: Syncthing's own UI is at {status.guiUrl}</span>
          ) : null}
        </footer>
        {showLog ? <pre className={styles.log}>{log.join("\n") || "(empty)"}</pre> : null}
      </div>
    </div>
  );
}
