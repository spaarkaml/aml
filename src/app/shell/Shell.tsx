import { type ReactNode, useEffect } from "react";
import { AppearanceScreen } from "@/features/appearance/AppearanceScreen";
import { useAppearance } from "@/features/appearance/useAppearance";
import { CommandPalette } from "@/features/commands/CommandPalette";
import { useGlobalShortcuts } from "@/features/commands/useGlobalShortcuts";
import { useGoals } from "@/features/goals/useGoals";
import { useLayoutStore } from "@/features/layout/store";
import { QuickOpen } from "@/features/quickopen/QuickOpen";
import { SettingsScreen } from "@/features/settings/SettingsScreen";
import { StatsScreen } from "@/features/stats/StatsScreen";
import { SyncScreen } from "@/features/sync/SyncScreen";
import { useWritingStore } from "@/features/writing/store";
import type { AppInfo } from "@/ipc";
import { SidePanel } from "./SidePanel";
import { StatusBar } from "./StatusBar";
import styles from "./shell.module.css";
import { TopBar } from "./TopBar";

interface Props {
  info: AppInfo | null;
  left?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
}

export function Shell({ info, left, right, children }: Props) {
  useAppearance();
  useGlobalShortcuts();
  useGoals();
  const leftPanel = useLayoutStore((s) => s.left);
  const rightPanel = useLayoutStore((s) => s.right);
  const closeOverlays = useLayoutStore((s) => s.closeOverlays);
  const zen = useWritingStore((s) => s.zen);
  const setZen = useWritingStore((s) => s.setZen);
  const overlayOpen =
    (leftPanel.open && !leftPanel.pinned) || (rightPanel.open && !rightPanel.pinned);
  // A pinned panel floats like every other one, so the page has to be told to move over:
  // its width, plus the gap it sits in and the same gap again on the inside.
  const room = (p: typeof leftPanel) => (p.open && p.pinned ? `calc(${p.width}px + 24px)` : "0px");

  useEffect(() => {
    if (!overlayOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeOverlays();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [overlayOpen, closeOverlays]);

  // Zen hides every way out, so Escape has to be one.
  useEffect(() => {
    if (!zen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zen, setZen]);

  if (zen) {
    return (
      <div className={styles.root} data-zen="true">
        <main className={styles.center}>{children}</main>
        <p className={styles.zenHint} data-testid="zen-hint">
          Escape to leave Zen
        </p>
        <CommandPalette />
        <QuickOpen />
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <TopBar />
      <div className={styles.body}>
        <SidePanel side="left" title="Browser">
          {left}
        </SidePanel>
        {overlayOpen ? (
          <button
            type="button"
            className={styles.overlayBackdrop}
            onMouseDown={closeOverlays}
            tabIndex={-1}
            aria-label="Close panel"
            data-testid="overlay-backdrop"
          />
        ) : null}
        <main
          className={styles.center}
          style={{ marginLeft: room(leftPanel), marginRight: room(rightPanel) }}
        >
          {children}
        </main>
        <SidePanel side="right" title="Context">
          {right}
        </SidePanel>
      </div>
      <StatusBar info={info} />
      <CommandPalette />
      <QuickOpen />
      <SyncScreen />
      <AppearanceScreen />
      <SettingsScreen />
      <StatsScreen />
    </div>
  );
}
