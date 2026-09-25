import { expect, test } from "@playwright/test";
import { assertAccessible } from "./harness/accessible";
import { launchPupitre, type Running } from "./harness/launch";
import { answerOnboarding, reachConfig } from "./harness/onboarding";

const INSTALL = /^Installer$/;
const ADVANCED = /^Réglages avancés/;

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

  test("mène une machine nue du vide jusqu'à Prêt", async () => {
    const { page } = running;

    await reachConfig(page, { pick: ["PostgreSQL"] });

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

    await test.step("le socle demande l'identité, range le reste", async () => {
      await page.locator("#core\\.system\\.git_name").fill("Ada Lovelace");
      await page
        .locator("#core\\.system\\.git_email")
        .fill("ada@pupitre.studio");

      await expect(page.locator("#core\\.system\\.timezone")).toBeHidden();
      await page.getByText(ADVANCED).click();
      await page.locator("#core\\.system\\.timezone").fill("Europe/Paris");
    });

    await test.step("le service suivant n'a rien à demander qu'un secret généré", async () => {
      await page
        .locator("[data-actions='config']")
        .getByRole("button", { name: "Suivant" })
        .click();

      await expect(page.locator('[data-group="db.postgres"]')).toBeVisible();
      await expect(page.getByText("Généré pour cette machine")).toBeVisible();
    });

    await test.step("la configuration mène à l'installation", async () => {
      await page
        .locator("[data-actions='config']")
        .getByRole("button", { name: INSTALL })
        .click();

      await expect(
        page.locator('[data-step="install"] [data-current]')
      ).toHaveCount(1);
    });

    await test.step("l'installation dit qu'elle est finie, en clair", async () => {
      await expect(page.getByText("Tout est installé.")).toBeVisible();
      await page.getByRole("button", { name: "Continuer" }).click();

      await expect(
        page.locator('[data-step="harden"] [data-current]')
      ).toHaveCount(1);
    });

    await test.step("la sécurité ferme root et nomme le compte", async () => {
      await expect(page.getByText("L'accès root est fermé.")).toBeVisible();
      await expect(page.getByText("dev").first()).toBeVisible();
    });

    await test.step("dev reçoit un mot de passe sudo, masqué jusqu'à ce qu'on le demande", async () => {
      await expect(
        page.getByText("Sudo demande un mot de passe à dev")
      ).toBeVisible();
      await expect(page.getByText("k7mp-q2xw-9hdt-3vzc-u8fa-6rne")).toHaveCount(
        0
      );

      await page
        .getByRole("button", { name: "Afficher le mot de passe sudo de dev" })
        .click();

      await expect(
        page.getByText("k7mp-q2xw-9hdt-3vzc-u8fa-6rne")
      ).toBeVisible();
      await assertAccessible(page, "onboarding/harden");
      await page.getByRole("button", { name: "Terminer" }).click();

      await expect(
        page.locator('[data-step="done"] [data-current]')
      ).toHaveCount(1);
    });

    await test.step("le serveur est prêt, sans projet imposé", async () => {
      await expect(page.getByRole("banner").getByText("Prêt")).toBeVisible();
      await expect(page.getByText("Connecté en dev")).toBeVisible();
      await expect(page.getByText("L'accès root est fermé")).toBeVisible();
      await assertAccessible(page, "onboarding/done");
    });
  });
});
