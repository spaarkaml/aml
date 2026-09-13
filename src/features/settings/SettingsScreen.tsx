import { useEffect } from "react";
import { useAppearanceStore } from "@/features/appearance/store";
import { useKeymapStore } from "@/features/commands/keymapStore";
import { todayIso } from "@/features/daily/dates";
import { useFolioStore } from "@/features/folio/store";
import { formatBytes } from "@/features/history/timeline";
import { useSyncStore } from "@/features/sync/store";
import { TypesSettings } from "@/features/types/TypesSettings";
import styles from "./SettingsScreen.module.css";
import { DEFAULT_DAILY_FOLDER, useSettingsStore } from "./store";

/**
 * Settings (⌘,): what the Folio does, as opposed to what it looks like.
 *
 * Appearance keeps its own screen — it is long, and it previews live — so this one links to
 * it rather than swallowing it. Everything here is saved in the Folio the moment it is
 * accepted; there is no OK button to forget to press.
 */
export function SettingsScreen() {
  const open = useSettingsStore((s) => s.open);
  const setOpen = useSettingsStore((s) => s.setOpen);
  const dailyFolder = useSettingsStore((s) => s.dailyFolder);
  const setDailyFolder = useSettingsStore((s) => s.setDailyFolder);
  const dailyGoal = useSettingsStore((s) => s.dailyGoal);
  const setDailyGoal = useSettingsStore((s) => s.setDailyGoal);
  const save = useSettingsStore((s) => s.save);
  const error = useSettingsStore((s) => s.error);
  const saved = useSettingsStore((s) => s.saved);
  const folio = useFolioStore((s) => s.folio);
  const keepAllDays = useSettingsStore((s) => s.keepAllDays);
  const keepDailyDays = useSettingsStore((s) => s.keepDailyDays);
  const usage = useSettingsStore((s) => s.snapshotUsage);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open) return null;

  const folder = dailyFolder.trim() || DEFAULT_DAILY_FOLDER;
  const today = todayIso();

  return (
    <div className={styles.backdrop} data-testid="settings-backdrop">
      <button
        type="button"
        className={styles.backdropButton}
        onMouseDown={() => setOpen(false)}
        tabIndex={-1}
        aria-label="Close settings"
      />
      <div className={styles.panel} role="dialog" aria-label="Settings">
        <div className={styles.head}>
          <h2 className={styles.title}>Settings</h2>
          <button
            type="button"
            className={styles.small}
            onClick={() => setOpen(false)}
            data-testid="settings-close"
          >
            Done
          </button>
        </div>

        <p className={styles.where} data-testid="settings-where">
          {folio
            ? `Saved in ${folio.name} — these follow the Folio to your other machines.`
            : "Open a Folio to change its settings."}
        </p>

        <section className={styles.section}>
          <h3 className={styles.heading}>Daily notes</h3>
          <form
            className={styles.field}
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <label className={styles.label} htmlFor="daily-folder">
              Folder
            </label>
            <input
              id="daily-folder"
              className={styles.input}
              value={dailyFolder}
              disabled={!folio}
              onChange={(e) => setDailyFolder(e.target.value)}
              onBlur={() => void save()}
              placeholder={DEFAULT_DAILY_FOLDER}
              spellCheck={false}
              aria-label="Folder for new Daily notes"
              data-testid="daily-folder"
            />
            {saved && !error ? (
              <span className={styles.saved} data-testid="settings-saved">
                Saved
              </span>
            ) : null}
          </form>
          {error ? (
            <p className={styles.error} role="alert" data-testid="settings-error">
              {error}
            </p>
          ) : (
            <p className={styles.note} data-testid="daily-example">
              New Daily notes are written to{" "}
              <code>{`${folder}/${today.slice(0, 4)}/${today}.md`}</code>. Notes already written
              stay where they are.
            </p>
          )}
        </section>

        <section className={styles.section}>
          <h3 className={styles.heading}>Goals</h3>
          <form
            className={styles.field}
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <label className={styles.label} htmlFor="daily-goal">
              Words a day
            </label>
            <input
              id="daily-goal"
              className={styles.input}
              type="number"
              min="0"
              step="50"
              value={dailyGoal}
              disabled={!folio}
              onChange={(e) => setDailyGoal(e.target.value)}
              onBlur={() => void save()}
              placeholder="none"
              aria-label="Words a day to aim for"
              data-testid="daily-goal"
            />
          </form>
          <p className={styles.note}>
            What you write today is counted on this machine, so the two do not add up to something
            neither of them wrote. A note's own target is one of its properties.
          </p>
        </section>

        <section className={styles.section}>
          <h3 className={styles.heading}>Snapshots</h3>
          <form
            className={styles.field}
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <label className={styles.label} htmlFor="keep-all-days">
              Keep all
            </label>
            <input
              id="keep-all-days"
              className={styles.days}
              type="number"
              min="1"
              value={keepAllDays}
              disabled={!folio}
              onChange={(e) => useSettingsStore.getState().setKeepAllDays(e.target.value)}
              onBlur={() => void save()}
              placeholder="7"
              aria-label="Days every snapshot is kept"
            />
            <span className={styles.unit}>days, then one a day until</span>
            <input
              className={styles.days}
              type="number"
              min="1"
              value={keepDailyDays}
              disabled={!folio}
              onChange={(e) => useSettingsStore.getState().setKeepDailyDays(e.target.value)}
              onBlur={() => void save()}
              placeholder="90"
              aria-label="Days one snapshot a day is kept"
            />
            <span className={styles.unit}>days old</span>
          </form>
          <p className={styles.note} data-testid="settings-snapshots">
            A note is kept as it was when you start changing it, and every 30 minutes while you
            write. Labelled snapshots are kept for ever.
            {usage
              ? ` This Folio holds ${usage.count.toLocaleString("en-AU")} ${
                  usage.count === 1 ? "snapshot" : "snapshots"
                } (${formatBytes(usage.bytes)}).`
              : ""}
          </p>
        </section>

        <section className={styles.section}>
          <h3 className={styles.heading}>Note types</h3>
          <TypesSettings />
        </section>

        <section className={styles.section}>
          <h3 className={styles.heading}>Elsewhere</h3>
          <div className={styles.row}>
            <button
              type="button"
              className={styles.small}
              onClick={() => {
                setOpen(false);
                useAppearanceStore.getState().setOpen(true);
              }}
              data-testid="settings-appearance"
            >
              Appearance…
            </button>
            <button
              type="button"
              className={styles.small}
              onClick={() => {
                setOpen(false);
                useSyncStore.getState().setOpen(true);
              }}
            >
              NAS Sync…
            </button>
            <button
              type="button"
              className={styles.small}
              onClick={() => {
                setOpen(false);
                useKeymapStore.getState().setOpen(true);
              }}
            >
              Keyboard Shortcuts…
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
