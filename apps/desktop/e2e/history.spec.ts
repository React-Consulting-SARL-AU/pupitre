import { expect, test } from "@playwright/test";
import { assertAccessible } from "./harness/accessible";
import { launchPupitre, type Running } from "./harness/launch";

/**
 * The two arrows of the band, and the keys that stand in for them.
 *
 * The app has no window history to lean on: the scenario walks three views
 * through the sidebar, comes back through the arrows, goes forward again
 * through the keyboard, checks that an arrow with nowhere to go says so, and
 * that a service's own page is a step of its own behind the list.
 */
const DASHBOARD = "1 projet en ligne";

const BACK = /^Retour \(/;
const FORWARD = /^Avancer \(/;

test.describe("historique", () => {
  let running: Running;

  test.beforeAll(async () => {
    running = await launchPupitre();
  });

  test.afterAll(async () => {
    await running.app.close();
  });

  test("les flèches reviennent en arrière puis en avant", async () => {
    const { page } = running;

    const back = page.getByRole("button", { name: BACK });
    const forward = page.getByRole("button", { name: FORWARD });
    const heading = (name: string | RegExp) =>
      page.getByRole("heading", { level: 1, name });

    await expect(heading(DASHBOARD)).toBeVisible();
    await expect(back).toBeDisabled();
    await expect(forward).toBeDisabled();

    await page.getByRole("button", { name: "Services" }).click();
    await expect(heading("atelier")).toBeVisible();

    await page.getByRole("button", { name: "Réglages" }).click();
    await expect(heading("Réglages")).toBeVisible();
    await expect(back).toBeEnabled();
    await expect(forward).toBeDisabled();

    await back.click();
    await expect(heading("atelier")).toBeVisible();
    await expect(forward).toBeEnabled();

    await back.click();
    await expect(heading(DASHBOARD)).toBeVisible();
    await expect(back).toBeDisabled();

    await test.step("le clavier suit les mêmes pas", async () => {
      const chord =
        process.platform === "darwin"
          ? { back: "Meta+[", forward: "Meta+]" }
          : { back: "Alt+ArrowLeft", forward: "Alt+ArrowRight" };

      await page.keyboard.press(chord.forward);
      await expect(heading("atelier")).toBeVisible();

      await page.keyboard.press(chord.forward);
      await expect(heading("Réglages")).toBeVisible();
      await expect(forward).toBeDisabled();

      await page.keyboard.press(chord.back);
      await expect(heading("atelier")).toBeVisible();
    });

    await test.step("repartir d'un point du passé oublie ce qui était devant", async () => {
      await page.getByRole("button", { name: "Tableau de bord" }).click();
      await expect(heading(DASHBOARD)).toBeVisible();
      await expect(forward).toBeDisabled();
      await expect(back).toBeEnabled();
    });

    await test.step("la page d'un service se quitte vers la liste, pas vers le tableau de bord", async () => {
      const allServices = page.getByRole("button", {
        name: "Tous les services",
      });

      await page.getByRole("button", { name: "Services" }).click();
      await page.locator('[data-service="db.postgres"]').click();
      await expect(allServices).toBeVisible();

      await back.click();
      await expect(heading("atelier")).toBeVisible();
      await expect(page.locator('[data-service="db.postgres"]')).toBeVisible();

      await forward.click();
      await expect(allServices).toBeVisible();
    });

    await assertAccessible(page, "historique");
  });
});
