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
          code: "license_required",
          fix: "Ouvrez https://app.pupitre.studio : Pupitre est gratuit jusqu'à 3 serveurs par organisation, une licence est requise au-delà.",
          message: "licence requise : ce serveur est en mode restreint",
        },
      }));
    });
  });

  test.afterAll(async () => {
    await running.app.close();
  });

  test("opens a page that says what the server answered", async () => {
    const { page } = running;

    await page.getByRole("button", { name: "Services" }).click();

    await test.step("the list comes from the snapshot", async () => {
      await expect(page.locator('[data-service="db.postgres"]')).toBeVisible();
    });

    await test.step("the page names the service and its state", async () => {
      await page.locator('[data-service="db.postgres"]').click();

      await expect(
        page.getByRole("heading", { name: "PostgreSQL" })
      ).toBeVisible();
      await expect(page.getByText("17.2")).toBeVisible();
      await expect(page.getByText("port 5432").first()).toBeVisible();
    });

    await test.step("it names the credential without showing it", async () => {
      await expect(page.getByText("Mot de passe applicatif")).toBeVisible();
    });

    await test.step("it says why the settings are missing", async () => {
      await expect(page.locator('[data-config="unknown"]')).toBeVisible();
      await expect(page.getByText(HELD_BACK)).toBeVisible();
    });

    await test.step("the unit journal arrives line by line", async () => {
      const journal = page.locator('[data-service-journal="db.postgres"]');

      await expect(journal).toBeVisible();
      await expect(
        journal.getByText("ready to accept connections")
      ).toBeVisible();
      await expect(journal.getByText("checkpoint complete")).toBeVisible();
    });

    await test.step("stopping shows the state the agent answered, and then offers starting", async () => {
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

    await test.step("restarting is confirmed by naming the service", async () => {
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

    await test.step("the database shell opens a terminal tab", async () => {
      await page.getByRole("button", { name: "Ouvrir un shell" }).click();

      await expect(page.getByRole("tab", { name: DATABASE_TAB })).toBeVisible();
    });

    await test.step("a CLI says whether it is logged in, and how to be", async () => {
      await page.getByRole("button", { name: "Services" }).click();
      await page.locator('[data-service="tool.github"]').click();

      const login = page.locator('[data-service-account="signed_out"]');

      await expect(login).toBeVisible();
      await expect(login.getByText("non connecté")).toBeVisible();
      await expect(login.getByText(SIGN_IN_FIX)).toBeVisible();

      await page.getByRole("button", { name: "Tous les services" }).click();
      await expect(page.locator('[data-service="tool.github"]')).toBeVisible();
    });

    await test.step("the page passes the accessibility check", async () => {
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
