import { useEffect } from "react";
import { applyMode, resolveMode, useAppearanceStore } from "./store";

/** Applies the resolved mode to <html data-mode> and tracks OS changes while on "system". */
export function useAppearance(): void {
  const setting = useAppearanceStore((s) => s.setting);
  useEffect(() => {
    applyMode(resolveMode(setting));
    if (setting !== "system" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyMode(resolveMode("system", mq.matches));
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [setting]);
}
