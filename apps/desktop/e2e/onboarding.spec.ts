import { expect, test } from "@playwright/test";
import { assertAccessible } from "./harness/accessible";
import { launchPupitre, type Running } from "./harness/launch";
import { answerOnboarding, reachConfig } from "./harness/onboarding";

const INSTALL = /^Installer$/;
const ADVANCED = /^Réglages avancés/;

test.describe("onboarding", () => {
  let running: Running;

  test.beforeAll(async () => {
    running = await launchPupitre();
    await answerOnboarding(running.app);
  });

  test.afterAll(async () => {
    await running.app.close();
  });

  test("takes a bare machine from nothing to Ready", async () => {
    const { page } = running;

    await reachConfig(page, { pick: ["PostgreSQL"] });

    await test.step("the shell stays, only the body changes", async () => {
      await expect(page.locator("[data-step-heading]")).toBeVisible();
      await expect(page.getByText("atelier").first()).toBeVisible();
    });

    await test.step("the rail says where you are", async () => {
      await expect(
        page.locator('[data-step="config"] [data-current]')
      ).toHaveCount(1);
    });

    await test.step("the step passes the accessibility check", async () => {
      await assertAccessible(page, "onboarding/config");
    });

    await test.step("the base asks for the identity, tucks away the rest", async () => {
      await page.locator("#core\\.system\\.git_name").fill("Ada Lovelace");
      await page
        .locator("#core\\.system\\.git_email")
        .fill("ada@pupitre.studio");

      await expect(page.locator("#core\\.system\\.timezone")).toBeHidden();
      await page.getByText(ADVANCED).click();
      await page.locator("#core\\.system\\.timezone").fill("Europe/Paris");
    });

    await test.step("the next service asks for nothing but a generated secret", async () => {
      await page
        .locator("[data-actions='config']")
        .getByRole("button", { name: "Suivant" })
        .click();

      await expect(page.locator('[data-group="db.postgres"]')).toBeVisible();
      await expect(page.getByText("Généré pour ce serveur")).toBeVisible();
    });

    await test.step("the configuration leads to the installation", async () => {
      await page
        .locator("[data-actions='config']")
        .getByRole("button", { name: INSTALL })
        .click();

      await expect(
        page.locator('[data-step="install"] [data-current]')
      ).toHaveCount(1);
    });

    await test.step("the installation says it is finished, in plain words", async () => {
      await expect(page.getByText("Tout est installé.")).toBeVisible();
      await page.getByRole("button", { name: "Continuer" }).click();

      await expect(
        page.locator('[data-step="harden"] [data-current]')
      ).toHaveCount(1);
    });

    await test.step("hardening closes root and names the account", async () => {
      await expect(page.getByText("L'accès root est fermé.")).toBeVisible();
      await expect(page.getByText("dev").first()).toBeVisible();
    });

    await test.step("dev receives a sudo password, hidden until asked for", async () => {
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

    await test.step("the server is ready, with no project imposed", async () => {
      await expect(page.getByRole("banner").getByText("Prêt")).toBeVisible();
      await expect(page.getByText("Connecté en tant que dev")).toBeVisible();
      await expect(page.getByText("L'accès root est fermé")).toBeVisible();
      await assertAccessible(page, "onboarding/done");
    });
  });
});
