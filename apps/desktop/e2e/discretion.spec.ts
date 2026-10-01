import { expect, test } from "@playwright/test";
import { launchPupitre, type Running } from "./harness/launch";

// A dozen windows dropped over an editor per run is why nobody would run the suite while working.
test.describe("discretion", () => {
  let running: Running;

  test.beforeAll(async () => {
    running = await launchPupitre();
  });

  test.afterAll(async () => {
    await running.app.close();
  });

  test("shows no window and never takes focus", async () => {
    const seen = await running.app.evaluate(({ app, BrowserWindow }) => {
      const windows = BrowserWindow.getAllWindows();

      return {
        count: windows.length,
        // No activation-policy getter exists; an accessory app loses its Dock icon.
        docked: app.dock?.isVisible() ?? false,
        focused: BrowserWindow.getFocusedWindow() !== null,
        visible: windows.filter((window) => window.isVisible()).length,
      };
    });

    expect(seen.count).toBeGreaterThan(0);
    expect(seen.visible).toBe(0);
    expect(seen.focused).toBe(false);
    expect(seen.docked).toBe(false);
  });

  test("still paints the page, otherwise the screenshots would be worthless", async () => {
    const { page } = running;

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const shot = await page.screenshot();

    expect(shot.byteLength).toBeGreaterThan(10_000);
  });
});
