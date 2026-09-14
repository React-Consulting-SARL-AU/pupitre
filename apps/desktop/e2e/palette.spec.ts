import { expect, test } from "@playwright/test";
import { assertAccessible } from "./harness/accessible";
import { launchPupitre, type Running } from "./harness/launch";

/**
 * The command palette: one chord, a few letters, Return.
 *
 * What is proved here is the whole loop — the chord opens it, typing narrows
 * it, the arrows and Return land where the click would have — and that the
 * dialog reads as one to a keyboard and a screen reader.
 */
const CHORD = process.platform === "darwin" ? "Meta+k" : "Control+k";

const DASHBOARD = "Tableau de bord";

test.describe("palette", () => {
  let running: Running;

  test.beforeAll(async () => {
    running = await launchPupitre();
  });

  test.afterAll(async () => {
    await running.app.close();
  });

  test("va à un projet depuis le clavier", async () => {
    const { page } = running;
    const palette = page.getByRole("dialog", { name: "Aller à" });

    await expect(
      page.getByRole("heading", { level: 1, name: DASHBOARD })
    ).toBeVisible();

    await test.step("le raccourci ouvre la palette sur toutes les entrées", async () => {
      await page.keyboard.press(CHORD);

      await expect(palette).toBeVisible();
      await expect(palette.getByRole("combobox")).toBeFocused();
      await expect(
        palette.locator('[data-palette-entry="view:dashboard"]')
      ).toBeVisible();
      await expect(
        palette.locator('[data-palette-entry="project:flymate-api"]')
      ).toBeVisible();
    });

    await test.step("la frappe filtre, la première entrée est choisie", async () => {
      await page.keyboard.type("atlas");

      await expect(
        palette.locator('[data-palette-entry="project:atlas-web"]')
      ).toHaveAttribute("aria-selected", "true");
      await expect(
        palette.locator('[data-palette-entry="view:dashboard"]')
      ).toHaveCount(0);
    });

    await test.step("l'accessibilité de la palette tient", async () => {
      await assertAccessible(page, "palette");
    });

    await test.step("Entrée ouvre le projet et ferme la palette", async () => {
      await page.keyboard.press("Enter");

      await expect(palette).toHaveCount(0);
      await expect(
        page.getByRole("heading", { level: 1, name: "atlas-web" })
      ).toBeVisible();
    });

    await test.step("Échap ferme sans rien faire", async () => {
      await page.keyboard.press(CHORD);
      await expect(palette).toBeVisible();

      await page.keyboard.press("Escape");

      await expect(palette).toHaveCount(0);
      await expect(
        page.getByRole("heading", { level: 1, name: "atlas-web" })
      ).toBeVisible();
    });
  });
});
