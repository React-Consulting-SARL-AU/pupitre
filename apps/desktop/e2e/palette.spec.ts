import { expect, test } from "@playwright/test";
import { assertAccessible } from "./harness/accessible";
import { launchPupitre, type Running } from "./harness/launch";

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

  test("goes to a project from the keyboard", async () => {
    const { page } = running;
    const palette = page.getByRole("dialog", { name: "Aller à" });

    await expect(
      page.getByRole("heading", { level: 1, name: DASHBOARD })
    ).toBeVisible();

    await test.step("the shortcut opens the palette on all entries", async () => {
      await page.keyboard.press(CHORD);

      await expect(palette).toBeVisible();
      await expect(palette.getByRole("combobox")).toBeFocused();
      await expect(
        palette.locator('[data-palette-entry="view:dashboard"]')
      ).toBeVisible();
      await expect(
        palette.locator('[data-palette-entry="project:flyleaf-api"]')
      ).toBeVisible();
    });

    await test.step("typing filters, the first entry is selected", async () => {
      await page.keyboard.type("atlas");

      await expect(
        palette.locator('[data-palette-entry="project:atlas-web"]')
      ).toHaveAttribute("aria-selected", "true");
      await expect(
        palette.locator('[data-palette-entry="view:dashboard"]')
      ).toHaveCount(0);
    });

    await test.step("the palette passes the accessibility check", async () => {
      await assertAccessible(page, "palette");
    });

    await test.step("Enter opens the project and closes the palette", async () => {
      await page.keyboard.press("Enter");

      await expect(palette).toHaveCount(0);
      await expect(
        page.getByRole("heading", { level: 1, name: "atlas-web" })
      ).toBeVisible();
    });

    await test.step("Escape closes without doing anything", async () => {
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
