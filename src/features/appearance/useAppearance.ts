import { useEffect } from "react";
import type { ModeSetting } from "./store";
import { applyAppearance, applyMode, current, resolveMode, useAppearanceStore } from "./store";

/**
 * Keeps `<html data-mode>` and the `:root` custom properties in step with the settings in
 * charge — the Folio's, or this device's while the override is on — and follows the OS while
 * the mode is "system".
 */
export function useAppearance(): void {
  const folio = useAppearanceStore((s) => s.folio);
  const device = useAppearanceStore((s) => s.device);
  const useDevice = useAppearanceStore((s) => s.useDevice);
  const appearance = current({ folio, device, useDevice });
  const setting = (appearance.mode ?? "system") as ModeSetting;

  useEffect(() => {
    const paint = (systemDark?: boolean) => {
      const mode = resolveMode(setting, systemDark);
      applyMode(mode);
      applyAppearance(appearance, mode);
    };
    paint();
    if (setting !== "system" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => paint(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [setting, appearance]);
}
