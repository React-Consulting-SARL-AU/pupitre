import { defineConfig, devices } from "@playwright/test"
import { HARNESS_ORIGIN, HARNESS_PORT, VITE_PORT } from "./e2e/harness/ports"

const SERVER_TIMEOUT_MS = 180_000

const consoleEnv = {
  BETTER_AUTH_SECRET: "pupitre-test-secret-pupitre-test-secret",
  BETTER_AUTH_URL: HARNESS_ORIGIN,
  VITE_APP_URL: HARNESS_ORIGIN,
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? "line" : "list",
  outputDir: "../../.playwright/artifacts",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: HARNESS_ORIGIN,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `bun run vite dev --host 127.0.0.1 --port ${VITE_PORT} --strictPort`,
      url: `http://127.0.0.1:${VITE_PORT}/`,
      timeout: SERVER_TIMEOUT_MS,
      reuseExistingServer: false,
      stdout: "ignore",
      stderr: "pipe",
      env: consoleEnv,
    },
    {
      command: "bun run e2e/harness/server.ts",
      url: `http://localhost:${HARNESS_PORT}/__e2e/health`,
      timeout: SERVER_TIMEOUT_MS,
      reuseExistingServer: false,
      stdout: "ignore",
      stderr: "pipe",
    },
  ],
})
