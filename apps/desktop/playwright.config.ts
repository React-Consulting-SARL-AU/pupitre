import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? "line" : "list",
  outputDir: "../../.playwright/desktop",
  snapshotPathTemplate: "e2e/references/{arg}-{platform}{ext}",
  timeout: 90_000,
  expect: {
    timeout: 15_000,
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      // In CSS pixels, so a reference means the same on Retina and on a runner.
      scale: "css",
      // Two greys of the palette sit closer than 0.15: a higher one hides them.
      threshold: 0.05,
      maxDiffPixelRatio: 0.0003,
    },
  },
  use: {
    trace: "retain-on-failure",
    video: "off",
  },
});
