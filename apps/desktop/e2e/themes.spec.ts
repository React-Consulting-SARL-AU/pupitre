import { expect, type Page, test } from "@playwright/test";
import { DARK, LIGHT } from "@pupitre/design/tokens";
import { assertAccessible } from "./harness/accessible";
import { launchPupitre, type Running } from "./harness/launch";

const HEADING = "1 projet en ligne";
const BRANDED = ["db.postgres", "ai.claude", "exposure.cloudflare"];
const BRAND_COLOUR = /^#[0-9a-f]{6}$/;

async function dashboardIn(page: Page, theme: "light" | "dark"): Promise<void> {
  await page.getByRole("button", { name: "Réglages" }).click();
  await page.getByRole("button", { name: "Apparence" }).click();
  await page.getByLabel("Thème").selectOption(theme);

  await page.getByRole("button", { name: "Tableau de bord" }).click();

  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  await expect(
    page.getByRole("heading", { level: 1, name: HEADING })
  ).toBeVisible();
}

test.describe("thèmes", () => {
  let running: Running;

  test.beforeAll(async () => {
    running = await launchPupitre();
  });

  test.afterAll(async () => {
    await running.app.close();
  });

  // Both captures come from one launch: the only difference between them is
  // the theme. They are compared pixel for pixel, and only where their
  // references are kept: on macOS, the machine the product is looked at on. A
  // Linux runner draws other pixels, and checks the theme without an image.
  const compared = process.platform === "darwin";

  async function looksLike(page: Page, name: string): Promise<void> {
    if (compared) {
      await expect(page).toHaveScreenshot(name);
    }
  }

  test("le tableau de bord se rend en clair puis en sombre", async () => {
    const { page } = running;

    await expect(
      page.getByRole("heading", { level: 1, name: HEADING })
    ).toBeVisible();

    await test.step("les services portent leur marque", async () => {
      for (const moduleId of BRANDED) {
        const logo = page.locator(`[data-logo="${moduleId}"] svg`).first();

        await expect(logo).toHaveAttribute("fill", BRAND_COLOUR);
      }
    });

    // The contrast floor is a property of the palette, so it is measured in
    // both themes rather than once: an ink that passes on white can fail on the
    // dark ground it was paired with.
    await test.step("en clair", async () => {
      await dashboardIn(page, "light");
      await looksLike(page, "tableau-de-bord-clair.png");
      await assertAccessible(page, "tableau-de-bord/clair");
    });

    await test.step("en sombre", async () => {
      await dashboardIn(page, "dark");
      await looksLike(page, "tableau-de-bord-sombre.png");
      await assertAccessible(page, "tableau-de-bord/sombre");
    });
  });

  // The colour the window paints on its own, before the page draws and while it
  // is being resized: on a machine whose system is dark, a forced light theme
  // used to show dark edges.
  test("le fond natif de la fenêtre suit le thème forcé", async () => {
    const { app, page } = running;

    for (const [theme, token] of [
      ["light", LIGHT.base],
      ["dark", DARK.base],
    ] as const) {
      await dashboardIn(page, theme);

      const frame = await app.evaluate(({ BrowserWindow, nativeTheme }) => ({
        background: BrowserWindow.getAllWindows()[0]?.getBackgroundColor(),
        source: nativeTheme.themeSource,
      }));

      expect(frame.source).toBe(theme);
      expect(frame.background?.toLowerCase()).toBe(token);
    }
  });
});
