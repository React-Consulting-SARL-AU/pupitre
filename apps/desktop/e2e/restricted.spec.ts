import type { ElectronApplication } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { ANSWERS } from "./harness/fixtures";
import { launchPupitre, type Running } from "./harness/launch";

/**
 * A server whose agent answers `restricted`.
 *
 * The account is valid: the two sources of refusal are distinct, and it is the
 * machine that is suspended. It stays readable — the dashboard, its projects
 * and its sessions are there — and the app says once, at the top, why nothing
 * else is possible.
 */

function stubRestricted(app: ElectronApplication): Promise<void> {
  return app.evaluate(
    ({ ipcMain }, answers) => {
      ipcMain.removeHandler("agent:call");
      ipcMain.handle(
        "agent:call",
        (_event, _serverId: unknown, cmd: unknown) => {
          const result = (answers as Record<string, unknown>)[String(cmd)];

          if (result === undefined) {
            return {
              error: { code: "unknown_command", message: String(cmd) },
              ok: false,
            };
          }

          return {
            ok: true,
            result:
              String(cmd) === "snapshot"
                ? { ...(result as object), entitlement: "restricted" }
                : result,
          };
        }
      );
    },
    ANSWERS as Record<string, unknown>
  );
}

test.describe("serveur en mode restreint", () => {
  let running: Running;

  test.beforeAll(async () => {
    running = await launchPupitre();
    await stubRestricted(running.app);
    await running.page.reload();
  });

  test.afterAll(async () => {
    await running.app.close();
  });

  test("reste lisible et dit pourquoi rien d'autre n'est possible", async () => {
    const { page } = running;

    await expect(
      page.getByText("se laisse lire, et refuse tout le reste")
    ).toBeVisible();
    await expect(
      page.getByText("Régularisez l'abonnement de ce serveur dans la console")
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Ouvrir la console" })
    ).toBeVisible();

    // La machine reste devant les yeux : la barre latérale et ses projets.
    await expect(
      page.getByRole("button", { name: "Tableau de bord" })
    ).toBeVisible();
    await expect(page.getByText("flymate-api").first()).toBeVisible();
  });
});
