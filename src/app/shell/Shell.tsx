import { type ReactNode, useEffect } from "react";
import { useAppearance } from "@/features/appearance/useAppearance";
import { CommandPalette } from "@/features/commands/CommandPalette";
import { useGlobalShortcuts } from "@/features/commands/useGlobalShortcuts";
import { useLayoutStore } from "@/features/layout/store";
import { QuickOpen } from "@/features/quickopen/QuickOpen";
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
  const leftPanel = useLayoutStore((s) => s.left);
  const rightPanel = useLayoutStore((s) => s.right);
  const closeOverlays = useLayoutStore((s) => s.closeOverlays);
  const overlayOpen =
    (leftPanel.open && !leftPanel.pinned) || (rightPanel.open && !rightPanel.pinned);

  useEffect(() => {
    if (!overlayOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeOverlays();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [overlayOpen, closeOverlays]);

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
        <main className={styles.center}>{children}</main>
        <SidePanel side="right" title="Properties">
          {right}
        </SidePanel>
      </div>
      <StatusBar info={info} />
      <CommandPalette />
      <QuickOpen />
    </div>
  );
}
