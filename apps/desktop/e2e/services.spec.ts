import { expect, test } from "@playwright/test";
import { assertAccessible } from "./harness/accessible";
import { launchPupitre, type Running } from "./harness/launch";

const HELD_BACK = /tant que le serveur est retenu/;

const RESTART_QUESTION = /Redémarrer PostgreSQL/;

const DATABASE_TAB = /PostgreSQL/;

const SIGN_IN_FIX = /Reconnectez le compte GitHub/;

test.describe("services", () => {
  let running: Running;

  test.beforeAll(async () => {
    running = await launchPupitre();

    await running.app.evaluate(({ ipcMain }) => {
      const answer = (
        channel: string,
        reply: (...args: unknown[]) => unknown
      ) => {
        ipcMain.removeHandler(channel);
        ipcMain.handle(channel, (_event, ...args: unknown[]) => reply(...args));
      };

      answer("service:detail", (_server, moduleId) =>
        moduleId === "tool.github"
          ? {
              ok: true,
              result: {
                configured: true,
                credentials: ["Token d'accès"],
                id: "tool.github",
                login: {
                  fix: "Reconnectez le compte GitHub dans l'app puis appliquez la configuration de ce service.",
                  state: "signed_out",
                },
                name: "GitHub",
                state: "running",
                version: "2.80.0",
              },
            }
          : {
              ok: true,
              result: {
                configured: true,
                credentials: ["Mot de passe applicatif"],
                id: "db.postgres",
                name: "PostgreSQL",
                port: 5432,
                state: "running",
                unit: "postgresql.service",
                version: "17.2",
              },
            }
      );

      answer("catalog:list", () => ({
        ok: false,
        error: {
          code: "entitlement_required",
          fix: "Ouvrez la console.",
          message: "abonnement requis : ce serveur est en mode restreint",
        },
      }));
    });
  });

  test.afterAll(async () => {
    await running.app.close();
  });

  test("ouvre une fiche qui dit ce que le serveur a répondu", async () => {
    const { page } = running;

    await page.getByRole("button", { name: "Services" }).click();

    await test.step("la liste vient du snapshot", async () => {
      await expect(page.locator('[data-service="db.postgres"]')).toBeVisible();
    });

    await test.step("la fiche nomme le service et son état", async () => {
      await page.locator('[data-service="db.postgres"]').click();

      await expect(
        page.getByRole("heading", { name: "PostgreSQL" })
      ).toBeVisible();
      await expect(page.getByText("17.2")).toBeVisible();
      await expect(page.getByText("port 5432").first()).toBeVisible();
    });

    await test.step("elle nomme l'identifiant sans le montrer", async () => {
      await expect(page.getByText("Mot de passe applicatif")).toBeVisible();
    });

    await test.step("elle dit pourquoi les réglages manquent", async () => {
      await expect(page.locator('[data-config="unknown"]')).toBeVisible();
      await expect(page.getByText(HELD_BACK)).toBeVisible();
    });

    await test.step("le journal de l'unité arrive ligne par ligne", async () => {
      const journal = page.locator('[data-service-journal="db.postgres"]');

      await expect(journal).toBeVisible();
      await expect(
        journal.getByText("ready to accept connections")
      ).toBeVisible();
      await expect(journal.getByText("checkpoint complete")).toBeVisible();
    });

    await test.step("arrêter montre l'état que l'agent a répondu, et offre alors le démarrage", async () => {
      const controls = page.locator('[data-service-controls="db.postgres"]');

      await controls.getByRole("button", { name: "Arrêter" }).click();

      await expect(
        controls.getByRole("button", { exact: true, name: "Démarrer" })
      ).toBeVisible();
      await expect(
        page.locator('[data-state="stopped"]').first()
      ).toBeVisible();

      await controls
        .getByRole("button", { exact: true, name: "Démarrer" })
        .click();

      await expect(
        controls.getByRole("button", { name: "Arrêter" })
      ).toBeVisible();
    });

    await test.step("redémarrer se confirme en nommant le service", async () => {
      const controls = page.locator('[data-service-controls="db.postgres"]');

      await controls
        .getByRole("button", { exact: true, name: "Redémarrer" })
        .click();

      const question = page.getByRole("alertdialog");

      await expect(question.getByText(RESTART_QUESTION)).toBeVisible();

      await question
        .getByRole("button", { name: "Redémarrer maintenant" })
        .click();

      await expect(
        controls.getByRole("button", { name: "Arrêter" })
      ).toBeVisible();
    });

    await test.step("le shell de la base ouvre un onglet de terminal", async () => {
      await page.getByRole("button", { name: "Ouvrir un shell" }).click();

      await expect(page.getByRole("tab", { name: DATABASE_TAB })).toBeVisible();
    });

    await test.step("un CLI dit s'il est connecté, et comment l'être", async () => {
      await page.getByRole("button", { name: "Services" }).click();
      await page.locator('[data-service="tool.github"]').click();

      const login = page.locator('[data-service-account="signed_out"]');

      await expect(login).toBeVisible();
      await expect(login.getByText("non connecté")).toBeVisible();
      await expect(login.getByText(SIGN_IN_FIX)).toBeVisible();

      await page.getByRole("button", { name: "Tous les services" }).click();
      await expect(page.locator('[data-service="tool.github"]')).toBeVisible();
    });

    await test.step("l'accessibilité de la fiche tient", async () => {
      await page.getByRole("button", { name: "Services" }).click();
      await page.locator('[data-service="db.postgres"]').click();
      await expect(
        page.getByRole("heading", { name: "PostgreSQL" })
      ).toBeVisible();
      // The copy button fades in once the journal answers; measured mid-fade it fails contrast.
      await expect(
        page
          .locator('[data-service-journal="db.postgres"]')
          .getByRole("button", { name: "Copier les logs" })
      ).toBeEnabled();
      await assertAccessible(page, "services/panel");
    });
  });
});
