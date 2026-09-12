import { useEffect } from "react";
import { Icon } from "@/app/icons";
import type { AppInfo } from "@/ipc";
import { listenUpdateProgress, useUpdateStore } from "./store";
import styles from "./UpdateScreen.module.css";
import { formatDate, formatMb, percentOf } from "./update";

/**
 * The update screen (WP-8.2): what version is running, what is on offer, and one button.
 *
 * It is a dialog rather than a section of Settings because updating is not a Folio setting —
 * Settings says "these follow the Folio to your other machines", and this is the one thing
 * that is emphatically about *this* copy on *this* computer.
 */
export function UpdateScreen({ info }: { info: AppInfo | null }) {
  const open = useUpdateStore((s) => s.open);
  const setOpen = useUpdateStore((s) => s.setOpen);
  const stage = useUpdateStore((s) => s.stage);
  const found = useUpdateStore((s) => s.info);
  const downloaded = useUpdateStore((s) => s.downloaded);
  const total = useUpdateStore((s) => s.total);
  const error = useUpdateStore((s) => s.error);
  const auto = useUpdateStore((s) => s.auto);
  const setAuto = useUpdateStore((s) => s.setAuto);
  const check = useUpdateStore((s) => s.check);
  const install = useUpdateStore((s) => s.install);
  const skip = useUpdateStore((s) => s.skip);
  const busy = stage === "checking" || stage === "downloading";

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && stage !== "downloading") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen, stage]);

  // Progress only matters while the screen is up; nothing else in the app shows bytes.
  useEffect(() => {
    if (!open) return;
    return listenUpdateProgress();
  }, [open]);

  if (!open) return null;

  const percent = percentOf(downloaded, total);
  const date = formatDate(found?.date ?? null);

  return (
    <div className={styles.backdrop} data-testid="update-backdrop">
      <button
        type="button"
        className={styles.backdropButton}
        onMouseDown={() => (stage === "downloading" ? undefined : setOpen(false))}
        tabIndex={-1}
        aria-label="Close updates"
      />
      <div className={styles.panel} role="dialog" aria-label="Updates">
        <div className={styles.header}>
          <h2>Updates</h2>
          <button
            type="button"
            className={styles.close}
            onClick={() => setOpen(false)}
            disabled={stage === "downloading"}
            aria-label="Close"
            data-testid="update-close"
          >
            <Icon name="close" size={14} />
          </button>
        </div>

        {stage === "available" && found ? (
          <>
            <p className={styles.version} data-testid="update-version">
              AML {found.version}
            </p>
            <p className={styles.meta}>
              You are running {found.current}
              {date ? ` · released ${date}` : ""}
            </p>
            {found.notes ? (
              <div className={styles.notes} data-testid="update-notes">
                {found.notes}
              </div>
            ) : null}
          </>
        ) : (
          <p className={styles.line} data-testid="update-state">
            {stage === "checking"
              ? "Looking for a newer version…"
              : stage === "downloading"
                ? "Downloading the update…"
                : stage === "upToDate"
                  ? `AML ${info?.version ?? ""} is the newest version.`
                  : stage === "error"
                    ? "The check did not finish."
                    : `AML ${info?.version ?? ""} is installed on this computer.`}
          </p>
        )}

        {stage === "downloading" ? (
          <>
            <div className={styles.bar}>
              <div className={styles.fill} style={{ width: `${percent ?? 8}%` }} />
            </div>
            <p className={styles.meta} data-testid="update-progress">
              {percent === null
                ? `${formatMb(downloaded)} so far`
                : `${percent}% — ${formatMb(downloaded)} of ${formatMb(total ?? 0)}`}
            </p>
          </>
        ) : null}

        <div className={styles.actions}>
          {stage === "available" ? (
            <>
              <button
                type="button"
                className={styles.primary}
                onClick={() => void install()}
                data-testid="update-install"
              >
                Update and restart
              </button>
              <button type="button" className={styles.secondary} onClick={skip}>
                Not now
              </button>
            </>
          ) : (
            <button
              type="button"
              className={styles.primary}
              onClick={() => void check()}
              disabled={busy}
              data-testid="update-check"
            >
              {stage === "checking" ? "Checking…" : "Check now"}
            </button>
          )}
          <span className={styles.spacer} />
        </div>

        {error ? (
          <p className={styles.error} role="alert" data-testid="update-error">
            {error}
          </p>
        ) : null}

        <label className={styles.auto}>
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          Check for updates automatically
        </label>
        <p className={styles.footnote}>
          Updates are downloaded from AML’s own releases and are refused unless they carry AML’s
          signature. Nothing in your Folio is sent anywhere.
        </p>
      </div>
    </div>
  );
}
