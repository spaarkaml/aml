/**
 * Loaded only when the app runs in a plain browser in dev (no Tauri runtime), i.e. for
 * Playwright e2e and quick UI work. Mocks every IPC command the shell needs.
 * Never imported in production; main.tsx guards it.
 */
import { mockIPC } from "@tauri-apps/api/mocks";

export function installDevMocks(): void {
  mockIPC((cmd) => {
    switch (cmd) {
      case "app_info":
        return {
          name: "AML",
          version: "0.0.0-browser",
          platform: "browser",
          arch: "mock",
          debug: true,
        };
      default:
        throw new Error(`dev mock: unhandled command ${cmd}`);
    }
  });
}
