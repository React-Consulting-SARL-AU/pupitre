import { expect, test } from "@playwright/test";
import { assertAccessible } from "./harness/accessible";
import { launchPupitre, type Running } from "./harness/launch";

/**
 * A service, opened from the list.
 *
 * The panel used to be reachable by no scenario at all, which is how it came
 * to show a reader an empty page: everything it draws comes from two answers,
 * and a screen with neither said nothing rather than saying so.
 */
const HELD_BACK = /tant que le serveur est retenu/;

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

      answer("service:detail", () => ({
        ok: true,
        result: {
          credentials: ["Mot de passe applicatif"],
          id: "db.postgres",
          name: "PostgreSQL",
          port: 5432,
          state: "running",
          unit: "postgresql.service",
          version: "17.2",
        },
      }));

      answer("catalog:list", () => ({
        ok: false,
        error: {
          code: "entitlement_required",
          fix: "Ouvrez la console.",
          message: "abonnement requis : ce serveur est en mode restreint",
        },
      }));

      answer("service:forwards", () => []);
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

    /** A catalogue the server refuses used to take the whole Configuration section with it. */
    await test.step("elle dit pourquoi les réglages manquent", async () => {
      await expect(page.locator('[data-config="unknown"]')).toBeVisible();
      await expect(page.getByText(HELD_BACK)).toBeVisible();
    });

    await test.step("l'accessibilité de la fiche tient", async () => {
      await assertAccessible(page, "services/panel");
    });
  });
});
