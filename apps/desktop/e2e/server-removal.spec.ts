import type { ElectronApplication } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { assertAccessible } from "./harness/accessible";
import { launchPupitre, type Running } from "./harness/launch";

/**
 * The two deletions of a server, watched while they are still running.
 *
 * What the scenario is about is the hundred milliseconds after the click: the
 * button that was pressed says it is working, its neighbours cannot be pressed,
 * and the row only leaves once the main process has answered. The bridge is
 * held open on purpose so that moment lasts long enough to be read.
 */

const HELD_MS = 1500;

const GRANTED_ID = "e2e-attribue";

function held(app: ElectronApplication, channel: string): Promise<void> {
  return app.evaluate(
    ({ ipcMain }, fixtures) => {
      ipcMain.removeHandler(fixtures.channel);
      ipcMain.handle(
        fixtures.channel,
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(fixtures.answer), fixtures.ms);
          })
      );
    },
    {
      answer: { active: null, servers: [], version: 1 },
      channel,
      ms: HELD_MS,
    }
  );
}

function grantedServer(app: ElectronApplication): Promise<void> {
  return app.evaluate(
    ({ ipcMain }, fixtures) => {
      const server = {
        grant: {
          adopted: true,
          id: fixtures.id,
          keyReady: true,
          listed: true,
          opened: true,
          status: "active",
        },
        host: "192.0.2.20",
        hostFingerprint: "SHA256:pupitre-e2e",
        id: fixtures.id,
        keyPath: "/dev/null",
        name: "atelier partagé",
        origin: "app",
        port: 22,
        user: "dev",
      };
      const config = { active: fixtures.id, servers: [server], version: 1 };

      ipcMain.removeHandler("servers");
      ipcMain.handle("servers", () => config);

      ipcMain.removeHandler("server-forget");
      ipcMain.handle(
        "server-forget",
        () =>
          new Promise((resolve) => {
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  result: { active: null, servers: [], version: 1 },
                }),
              fixtures.ms
            );
          })
      );
    },
    { id: GRANTED_ID, ms: HELD_MS }
  );
}

test.describe("la suppression d'un serveur", () => {
  let running: Running;

  test.beforeEach(async () => {
    running = await launchPupitre();
  });

  test.afterEach(async () => {
    await running.app.close();
  });

  test("le bouton attend tant que le retrait n'a pas répondu", async () => {
    const { app, page } = running;

    await held(app, "server-remove");
    await page.reload();

    await page.getByRole("button", { name: "Réglages" }).click();

    await assertAccessible(page, "reglages/serveurs");

    await page.getByRole("button", { name: "Supprimer atelier" }).click();

    const confirm = page.getByRole("button", {
      exact: true,
      name: "Supprimer définitivement",
    });

    await confirm.click();

    await expect(confirm).toHaveAttribute("aria-busy", "true");
    await expect(confirm).toBeDisabled();

    await expect(confirm).toBeHidden();
  });

  test("le bouton attend tant que la suppression partout n'a pas répondu", async () => {
    const { app, page } = running;

    await grantedServer(app);
    await page.reload();

    await page.getByRole("button", { name: "Réglages" }).click();
    await page
      .getByRole("button", { name: "Supprimer atelier partagé" })
      .click();

    const everywhere = page.getByRole("button", {
      exact: true,
      name: "Supprimer partout",
    });

    await everywhere.click();

    await expect(everywhere).toHaveAttribute("aria-busy", "true");
    await expect(everywhere).toBeDisabled();
    await expect(
      page.getByRole("button", {
        exact: true,
        name: "Retirer de cet ordinateur",
      })
    ).toBeDisabled();

    await expect(everywhere).toBeHidden();
  });
});
