import { expect, test } from "@playwright/test";
import { assertAccessible } from "./harness/accessible";
import {
  answerBackups,
  answerSecondComputer,
  PASSPHRASE,
} from "./harness/backups";
import { launchPupitre, type Running } from "./harness/launch";
import { answerOnboarding } from "./harness/onboarding";

const INSTALL = /^Installer$/;
const CONFIGURE = /^Continuer avec/;
const ADOPTED = /Votre organisation a déjà des sauvegardes/;

/**
 * A new server started from the organization's backup, on a computer that
 * has never configured backups: the bucket is given, the organization's key is
 * taken without the passphrase, and the passphrase is asked once, to restore.
 */
test.describe("onboarding depuis une sauvegarde", () => {
  let running: Running;

  test.beforeAll(async () => {
    running = await launchPupitre();
    await answerOnboarding(running.app);
    await answerBackups(running.app);
    await answerSecondComputer(running.app);
  });

  test.afterAll(async () => {
    await running.app.close();
  });

  test("repart d'une sauvegarde, installe, sécurise, puis ramène les données", async () => {
    const { page } = running;

    await page.getByRole("button", { name: "Réglages" }).click();
    await page.getByRole("tab", { name: "Serveurs" }).click();
    await page.getByRole("button", { name: "Installer Pupitre" }).click();

    await expect(page.getByText("Prêt à être installé")).toBeVisible();
    await page.getByRole("button", { name: INSTALL }).first().click();
    await expect(page.getByText("Agent en place")).toBeVisible();
    await page.getByRole("button", { name: "Choisir les services" }).click();

    await test.step("l'étape propose les sauvegardes de l'organisation", async () => {
      await expect(
        page.getByRole("heading", { name: "Repartir d'une sauvegarde ?" })
      ).toBeVisible();
      await expect(
        page.locator('[data-step="restore"] [data-current]')
      ).toHaveCount(1);
      await expect(page.locator("[data-restore-backup]")).toHaveCount(2);
    });

    await test.step("le seau se donne sans la phrase : la clé de l'organisation est reprise", async () => {
      await expect(page.getByText(ADOPTED)).toBeVisible();
      await expect(page.locator("#backup-passphrase")).toHaveCount(0);

      await page.getByRole("radio", { name: "Autre service S3" }).click();
      await page
        .locator("#backup-endpoint")
        .fill("https://acme.r2.cloudflarestorage.com");
      await page.locator("#backup-bucket").fill("pupitre-backups");
      await page.locator("#backup-access-key-id").fill("AKIA-E2E");
      await page
        .locator("#backup-secret-access-key")
        .fill("fake-secret-access-key-of-the-harness");
      await page
        .getByRole("button", { name: "Enregistrer la connexion" })
        .click();

      await expect(page.locator("#backup-endpoint")).toHaveCount(0);
      await expect(
        page.getByText(
          "Tapez la passphrase des sauvegardes pour repartir d'une sauvegarde."
        )
      ).toBeVisible();
    });

    await assertAccessible(page, "onboarding/restore");

    await test.step("la phrase de passe ouvre la sauvegarde", async () => {
      await page.locator("#restore-passphrase").fill(PASSPHRASE);
      await page
        .getByRole("button", { name: "Repartir de cette sauvegarde" })
        .click();

      await expect(
        page.locator('[data-step="catalog"] [data-current]')
      ).toHaveCount(1);
    });

    await test.step("le catalogue et la configuration s'ouvrent sur la sauvegarde", async () => {
      await page.getByRole("button", { name: CONFIGURE }).click();
      await expect(
        page.locator('[data-step="config"] [data-current]')
      ).toHaveCount(1);

      const bar = page.locator("[data-actions='config']");

      while ((await bar.getByRole("button", { name: INSTALL }).count()) === 0) {
        await bar.getByRole("button", { name: "Suivant" }).click();
      }

      await bar.getByRole("button", { name: INSTALL }).click();
      await expect(page.getByText("Tout est installé.")).toBeVisible();
      await page.getByRole("button", { name: "Continuer" }).click();
    });

    await test.step("la sécurité mène aux données", async () => {
      await page.getByRole("button", { name: "Passer aux données" }).click();

      await expect(
        page.locator('[data-step="data"] [data-current]')
      ).toHaveCount(1);
      await expect(
        page.getByRole("checkbox", { name: "Base PostgreSQL · flyleaf" })
      ).toBeChecked();
      await assertAccessible(page, "onboarding/data");
    });

    await test.step("les données reviennent et les projets démarrent", async () => {
      await page.getByRole("button", { name: "Ramener 3 parties" }).click();

      await expect(
        page.getByText(
          "Les données sont revenues et les projets sont démarrés."
        )
      ).toBeVisible();
      await page.getByRole("button", { name: "Terminer" }).click();

      await expect(
        page.locator('[data-step="done"] [data-current]')
      ).toHaveCount(1);
    });
  });
});
