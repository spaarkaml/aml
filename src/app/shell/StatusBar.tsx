import { useEffect } from "react";
import { todayIso } from "@/features/daily/dates";
import { useEditorStore } from "@/features/editor/store";
import { useFolioStore } from "@/features/folio/store";
import { ProgressRing } from "@/features/goals/ProgressRing";
import { useGoalsStore } from "@/features/goals/store";
import { describeIndex, listenIndexProgress, useIndexStore } from "@/features/index/store";
import { useLayoutStore } from "@/features/layout/store";
import { useSettingsStore } from "@/features/settings/store";
import { useSpellStore } from "@/features/spell/store";
import { useStatsStore } from "@/features/stats/store";
import { describeSync, startSyncPolling, useSyncStore } from "@/features/sync/store";
import { startUpdateChecks, updateOnOffer, useUpdateStore } from "@/features/update/store";
import { FOCUS_LABEL, useWritingStore } from "@/features/writing/store";
import type { AppInfo } from "@/ipc";
import { readingMinutes } from "@/lib/wordcount";
import { Icon } from "../icons";
import styles from "./shell.module.css";

export function StatusBar({ info }: { info: AppInfo | null }) {
  const words = useEditorStore((s) => s.words);
  const dirty = useEditorStore((s) => s.dirty);
  const saving = useEditorStore((s) => s.saving);
  const path = useEditorStore((s) => s.path);
  const spell = useSpellStore((s) => s.enabled);
  const toggleSpell = useSpellStore((s) => s.toggle);
  const folioRoot = useFolioStore((s) => s.folio?.root ?? null);
  const syncStatus = useSyncStore((s) => s.status);
  const disconnectedSince = useSyncStore((s) => s.disconnectedSince);
  const openSync = useSyncStore((s) => s.setOpen);
  const focus = useWritingStore((s) => s.focus);
  const typewriter = useWritingStore((s) => s.typewriter);
  const cycleFocus = useWritingStore((s) => s.cycleFocus);
  const toggleTypewriter = useWritingStore((s) => s.toggleTypewriter);
  const indexStatus = useIndexStore((s) => s.status);
  const openRight = useLayoutStore((s) => s.openPanel);
  const dailyGoal = Number(useSettingsStore((s) => s.dailyGoal)) || 0;
  const todayWords = useGoalsStore((s) => s.history[todayIso()] ?? 0);
  const openStats = useStatsStore((s) => s.setOpen);
  const openUpdate = useUpdateStore((s) => s.setOpen);
  const updateReady = useUpdateStore(updateOnOffer);
  const newVersion = useUpdateStore((s) => s.info?.version ?? null);
  // Sync is polled from launch, not from the first Folio: the sidecar starts with the app,
  // and "it is still coming up" is exactly what you want to see while you are waiting.
  useEffect(() => startSyncPolling(), []);
  // Updates check themselves on a timer; the chip below is the only thing they interrupt.
  useEffect(() => startUpdateChecks(), []);

  useEffect(() => {
    if (!folioRoot) return;
    return listenIndexProgress();
  }, [folioRoot]);
  const indexLabel = describeIndex(indexStatus);
  const syncLabel = describeSync(syncStatus, folioRoot, disconnectedSince);
  return (
    <footer className={styles.statusbar}>
      <button
        type="button"
        className={styles.statusButton}
        onClick={() => openStats(true)}
        title="Statistics for this note"
        data-testid="word-count"
      >
        {words.toLocaleString("en-AU")} {words === 1 ? "word" : "words"}
      </button>
      {path ? <span>{readingMinutes(words)} min read</span> : null}
      {dailyGoal > 0 ? (
        <button
          type="button"
          className={styles.statusButton}
          onClick={() => openRight("right")}
          title="Today's goal — click for Goals"
          data-testid="goal-chip"
        >
          <ProgressRing done={todayWords} goal={dailyGoal} size={12} />
          {todayWords.toLocaleString("en-AU")} / {dailyGoal.toLocaleString("en-AU")}
        </button>
      ) : null}
      <button
        type="button"
        className={styles.statusButton}
        onClick={toggleSpell}
        aria-pressed={spell}
        title={
          spell
            ? "Spell check on (en-AU) — click to turn off"
            : "Spell check off — click to turn on"
        }
        data-testid="spell-toggle"
      >
        {spell ? <Icon name="check" size={12} /> : null}
        en-AU{spell ? "" : " off"}
      </button>
      {path ? (
        <span
          data-testid="save-state"
          title={path}
          className={dirty && !saving ? styles.dirtyDot : undefined}
        >
          {saving ? "Saving…" : dirty ? "Unsaved" : "Saved"}
        </span>
      ) : null}
      {focus !== "off" ? (
        <button
          type="button"
          className={styles.chip}
          onClick={cycleFocus}
          title="Focus Mode — click to change"
          data-testid="focus-chip"
        >
          Focus: {FOCUS_LABEL[focus]}
        </button>
      ) : null}
      {typewriter ? (
        <button
          type="button"
          className={styles.chip}
          onClick={toggleTypewriter}
          title="Typewriter Mode — click to turn off"
          data-testid="typewriter-chip"
        >
          Typewriter
        </button>
      ) : null}
      {indexLabel ? (
        <span data-testid="index-state" role="status">
          {indexLabel}
        </span>
      ) : null}
      {syncLabel ? (
        <button
          type="button"
          className={styles.statusButton}
          onClick={() => openSync(true)}
          title="NAS sync settings"
          data-testid="sync-state"
        >
          {syncLabel}
        </button>
      ) : null}
      <span className={styles.spacer} />
      {updateReady ? (
        <button
          type="button"
          className={styles.updateChip}
          onClick={() => openUpdate(true)}
          title={`AML ${newVersion} is ready to install`}
          data-testid="update-chip"
        >
          Update to {newVersion}
        </button>
      ) : null}
      {info ? (
        <button
          type="button"
          className={styles.statusButton}
          onClick={() => openUpdate(true)}
          title="About AML and updates"
          data-testid="app-info"
        >
          v{info.version} · {info.platform}/{info.arch}
          {info.debug ? " · debug" : ""}
        </button>
      ) : null}
    </footer>
  );
}
