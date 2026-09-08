import { expect, test } from "@playwright/test";
import { assertAccessible } from "./harness/accessible";
import { launchPupitre, type Running } from "./harness/launch";
import { answerOnboarding, reachConfig } from "./harness/onboarding";

const INSTALL = /^Installer$/;

/**
 * The whole sequence, from a machine nobody has touched to a server the app
 * drives. The guide claimed this scenario existed for a while; it did not.
 */
test.describe("onboarding", () => {
  let running: Running;

  test.beforeAll(async () => {
    running = await launchPupitre();
    await answerOnboarding(running.app);
  });

  test.afterAll(async () => {
    await running.app.close();
  });

  test("mène une machine nue du vide au premier projet", async () => {
    const { page } = running;

    await reachConfig(page);

    await test.step("la coque reste, seul le corps change", async () => {
      await expect(page.locator("[data-step-heading]")).toBeVisible();
      await expect(page.getByText("atelier").first()).toBeVisible();
    });

    await test.step("le rail dit où l'on en est", async () => {
      await expect(
        page.locator('[data-step="config"] [data-current]')
      ).toHaveCount(1);
    });

    await test.step("l'accessibilité de l'étape tient", async () => {
      await assertAccessible(page, "onboarding/config");
    });

    await test.step("la configuration mène à l'installation", async () => {
      await page.locator("#core\\.system\\.git_name").fill("Ada Lovelace");
      await page
        .locator("#core\\.system\\.git_email")
        .fill("ada@pupitre.studio");
      await page.locator("#core\\.system\\.timezone").fill("Europe/Paris");

      await page
        .locator("[data-testid='config-actions']")
        .getByRole("button", { name: INSTALL })
        .click();

      await expect(
        page.locator('[data-step="install"] [data-current]')
      ).toHaveCount(1);
    });
  });
});
