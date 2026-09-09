import { defineConfig, devices } from "@playwright/test";

/**
 * E2E runs the React shell in Chromium against the Vite dev server with Tauri IPC mocked
 * (src/dev-mocks.ts). tauri-driver does not support macOS WebKit, so true in-app e2e is
 * limited to Windows CI later (WP-8.x). Everything shell-level is covered here.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 20_000,
  fullyParallel: true,
  // Two workers: the Vite dev server and Chromium share the CPU; more workers make
  // keystroke-driven editor tests flaky without exercising anything real.
  workers: 2,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: "http://localhost:1420",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:1420",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
