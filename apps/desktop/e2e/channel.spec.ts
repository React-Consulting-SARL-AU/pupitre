import { expect, test } from "@playwright/test";
import { launchPupitre, type Running } from "./harness/launch";
import { answerOnboarding, reachConfig } from "./harness/onboarding";

/**
 * The link drops while the machine is being installed, and comes back.
 *
 * An SSH session over a laptop's wifi drops; that is its ordinary life. What is
 * watched here is that the step does not fail for it: the shell says the link
 * is gone, the install goes on underneath, and the reader is told when it is
 * back instead of being left in front of a page that stopped for no reason.
 */

const HELD_MS = 1200;

const LOST = "Connexion à atelier perdue.";

const RETRYING = "Nouvelle tentative…";

const INSTALL = /^Installer$/;

/**
 * The install answers late, and cuts the link on its way.
 *
 * The event is the one the main process broadcasts when a channel closes, sent
 * with the identifier the call itself carried: nothing here has to guess which
 * server the app is talking to.
 */
function cutDuringInstall(app: Running["app"]): Promise<void> {
  return app.evaluate(({ BrowserWindow, ipcMain }, ms) => {
    const tell = (serverId: unknown, state: string) => {
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send("agent:channel", { serverId, state });
      }
    };

    ipcMain.removeHandler("install:start");
    ipcMain.handle(
      "install:start",
      (_event, _token: unknown, serverId: unknown) =>
        new Promise((resolve) => {
          tell(serverId, "lost");

          setTimeout(() => {
            tell(serverId, "open");
            resolve({
              ok: true,
              result: {
                failed: [],
                report_path: "/var/lib/pupitre/report.json",
                warned: [],
              },
            });
          }, ms);
        })
    );
  }, HELD_MS);
}

test.describe("un canal coupé pendant l'installation", () => {
  let running: Running;

  test.beforeAll(async () => {
    running = await launchPupitre();
    await answerOnboarding(running.app);
    await cutDuringInstall(running.app);
  });

  test.afterAll(async () => {
    await running.app.close();
  });

  test("le dit dans la coque, et l'installation lui survit", async () => {
    const { page } = running;

    await reachConfig(page);

    await page.locator("#core\\.system\\.git_name").fill("Ada Lovelace");
    await page.locator("#core\\.system\\.git_email").fill("ada@pupitre.studio");

    await page
      .locator("[data-actions='config']")
      .getByRole("button", { name: INSTALL })
      .click();

    await test.step("la coque dit le lien perdu, l'étape tient", async () => {
      await expect(page.getByText(LOST)).toBeVisible();
      await expect(page.getByText(RETRYING)).toBeVisible();

      await expect(
        page.locator('[data-step="install"] [data-current]')
      ).toHaveCount(1);
    });

    await test.step("le lien revient et l'installation a fini", async () => {
      await expect(page.getByText(LOST)).toBeHidden();
      await expect(page.getByText("Tout est installé.")).toBeVisible();
    });
  });
});
