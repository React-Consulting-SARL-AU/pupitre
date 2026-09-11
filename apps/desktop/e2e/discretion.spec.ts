import { expect, test } from "@playwright/test";
import { launchPupitre, type Running } from "./harness/launch";

/**
 * A scenario run stays off the screen of whoever is working on this machine.
 *
 * A suite is a dozen launches in a row, and a window dropped over an editor
 * twelve times is not a detail — it is the reason nobody runs the suite while
 * they work. Playwright reaches the page over the debugger, which draws and
 * captures a window nobody displays, so the window is never shown at all and
 * macOS is told the app is an accessory before it finishes launching.
 */
test.describe("discrétion", () => {
  let running: Running;

  test.beforeAll(async () => {
    running = await launchPupitre();
  });

  test.afterAll(async () => {
    await running.app.close();
  });

  test("ne montre aucune fenêtre et ne prend jamais la main", async () => {
    const seen = await running.app.evaluate(({ app, BrowserWindow }) => {
      const windows = BrowserWindow.getAllWindows();

      return {
        count: windows.length,
        // Electron has no getter for the activation policy; the Dock icon is
        // what an accessory application loses, so it is what proves it took.
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

  test("dessine tout de même la page, sinon les captures ne vaudraient rien", async () => {
    const { page } = running;

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const shot = await page.screenshot();

    expect(shot.byteLength).toBeGreaterThan(10_000);
  });
});
