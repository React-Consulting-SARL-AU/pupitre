import { expect, test } from "@playwright/test";
import { assertAccessible, tabOrder } from "./harness/accessible";
import { launchPupitre, type Running } from "./harness/launch";
import { answerOnboarding, reachConfig } from "./harness/onboarding";

const TIMEZONE_HINT = /À propos de Fuseau/;
const IANA = /Europe\/Paris/;
const ADVANCED = /^Réglages avancés/;

test.describe("configuration", () => {
  let running: Running;

  test.beforeAll(async () => {
    running = await launchPupitre();
    await answerOnboarding(running.app);
  });

  test.afterAll(async () => {
    await running.app.close();
  });

  test("refuses each field at its own spot, and ends on the action", async () => {
    const { page } = running;

    await reachConfig(page);

    const email = page.locator("#core\\.system\\.git_email");

    await expect(email).toBeVisible();

    await test.step("the index names the chosen modules", async () => {
      await expect(
        page.getByRole("navigation", { name: "Les services choisis" })
      ).toBeVisible();
    });

    await test.step("a refused format is read under the field", async () => {
      await email.fill("pas-une-adresse");
      await email.blur();

      await expect(email).toHaveAttribute("aria-invalid", "true");
      await expect(
        page.locator("#core\\.system\\.git_email-problem")
      ).toContainText("adresse électronique");
    });

    await test.step("the neighbouring field is not marked", async () => {
      await expect(
        page.locator("#core\\.system\\.git_name")
      ).not.toHaveAttribute("aria-invalid", "true");
    });

    await test.step("the action is at the foot of the screen", async () => {
      const bar = page.locator("[data-actions='config']");

      await expect(
        bar.getByRole("button", { name: "Installer" })
      ).toBeVisible();
    });

    await test.step("a corrected field stops being refused", async () => {
      await email.fill("ada@pupitre.studio");
      await email.blur();

      await expect(email).not.toHaveAttribute("aria-invalid", "true");
    });

    await test.step("the keyboard ends on the action", async () => {
      const order = await tabOrder(page);

      expect(order.length).toBeGreaterThan(0);
      expect(order.at(-1)).toContain("Installer");
    });

    await test.step("settings already made wait behind a fold", async () => {
      await expect(page.locator("#core\\.system\\.timezone")).toBeHidden();
      await page.getByText(ADVANCED).click();
      await expect(page.locator("#core\\.system\\.timezone")).toBeVisible();
    });

    await test.step("the bubble opens from the keyboard", async () => {
      await page.getByRole("button", { name: TIMEZONE_HINT }).focus();
      await page.keyboard.press("Enter");

      await expect(page.getByText(IANA).first()).toBeVisible();

      await page.keyboard.press("Escape");
    });

    await test.step("nothing serious to blame on accessibility", async () => {
      await assertAccessible(page, "configuration");
    });
  });
});
