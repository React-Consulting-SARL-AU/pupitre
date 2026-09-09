import { expect, test } from "@playwright/test";
import { assertAccessible, tabOrder } from "./harness/accessible";
import { launchPupitre, type Running } from "./harness/launch";
import { answerOnboarding, reachConfig } from "./harness/onboarding";

const TIMEZONE_HINT = /À propos de Fuseau/;
const IANA = /Europe\/Paris/;
const ADVANCED = /^Réglages avancés/;

/**
 * The configuration screen: what it refuses, where it says so, and what a
 * reader who never sees it is told.
 *
 * One launch and one walk: the screen is reached once and everything is asked
 * of it there, because a check run on whatever screen the last test left is a
 * check of nothing in particular.
 */
test.describe("configuration", () => {
  let running: Running;

  test.beforeAll(async () => {
    running = await launchPupitre();
    await answerOnboarding(running.app);
  });

  test.afterAll(async () => {
    await running.app.close();
  });

  test("refuse chaque champ à sa hauteur, et finit par l'action", async () => {
    const { page } = running;

    await reachConfig(page);

    const email = page.locator("#core\\.system\\.git_email");
    await expect(email).toBeVisible();

    await test.step("l'index nomme les modules choisis", async () => {
      await expect(
        page.getByRole("navigation", { name: "Les services choisis" })
      ).toBeVisible();
    });

    await test.step("un format refusé se lit sous le champ", async () => {
      await email.fill("pas-une-adresse");
      await email.blur();

      await expect(email).toHaveAttribute("aria-invalid", "true");
      await expect(
        page.locator("#core\\.system\\.git_email-problem")
      ).toContainText("adresse électronique");
    });

    await test.step("le champ voisin n'est pas marqué", async () => {
      await expect(
        page.locator("#core\\.system\\.git_name")
      ).not.toHaveAttribute("aria-invalid", "true");
    });

    await test.step("l'action est en bas de l'écran", async () => {
      const bar = page.locator("[data-actions='config']");

      await expect(
        bar.getByRole("button", { name: "Installer" })
      ).toBeVisible();
    });

    await test.step("un champ corrigé cesse d'être refusé", async () => {
      await email.fill("ada@pupitre.studio");
      await email.blur();

      await expect(email).not.toHaveAttribute("aria-invalid", "true");
    });

    await test.step("le clavier finit sur l'action", async () => {
      const order = await tabOrder(page);

      expect(order.length).toBeGreaterThan(0);
      expect(order.at(-1)).toContain("Installer");
    });

    await test.step("les réglages déjà faits attendent derrière un pli", async () => {
      await expect(page.locator("#core\\.system\\.timezone")).toBeHidden();
      await page.getByText(ADVANCED).click();
      await expect(page.locator("#core\\.system\\.timezone")).toBeVisible();
    });

    await test.step("la bulle s'ouvre au clavier", async () => {
      await page.getByRole("button", { name: TIMEZONE_HINT }).focus();
      await page.keyboard.press("Enter");

      await expect(page.getByText(IANA).first()).toBeVisible();

      await page.keyboard.press("Escape");
    });

    await test.step("rien de sérieux à reprocher à l'accessibilité", async () => {
      await assertAccessible(page, "configuration");
    });
  });
});
