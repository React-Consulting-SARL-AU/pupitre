import { expect, type Page, test } from "@playwright/test";
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
  // the theme.
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

    await test.step("en clair", async () => {
      await dashboardIn(page, "light");
      await expect(page).toHaveScreenshot("tableau-de-bord-clair.png");
    });

    await test.step("en sombre", async () => {
      await dashboardIn(page, "dark");
      await expect(page).toHaveScreenshot("tableau-de-bord-sombre.png");
    });
  });
});
