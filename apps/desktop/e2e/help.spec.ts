import type { ElectronApplication } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { assertAccessible } from "./harness/accessible";
import { launchPupitre, type Running } from "./harness/launch";

/**
 * The help page, from the sidebar: what another client needs to reach the
 * driven server, with that server's own values on it. The SSH file the main
 * process would read is the harness's empty one, so the state is answered
 * here as a shared file naming the fixture server.
 */

function stubSshShare(app: ElectronApplication): Promise<void> {
  return app.evaluate(({ ipcMain }) => {
    const state = {
      line: "Include /e2e/ssh/config",
      servers: [
        {
          host: "192.0.2.10",
          id: "e2e-atelier",
          identityFile: "/Users/e2e/.pupitre/desktop/keys/e2e-atelier",
          name: "atelier",
          port: 22,
          ssh: "atelier",
          user: "dev",
        },
      ],
      shared: true,
      userConfigPath: "/Users/e2e/.ssh/config",
    };

    ipcMain.removeHandler("ssh-share:state");
    ipcMain.handle("ssh-share:state", () => state);
  });
}

test.describe("l'aide", () => {
  let running: Running;

  test.beforeAll(async () => {
    running = await launchPupitre();
    await stubSshShare(running.app);
  });

  test.afterAll(async () => {
    await running.app.close();
  });

  test("dit comment un agent de code et un éditeur joignent le serveur piloté", async () => {
    const { page } = running;

    await page.getByRole("button", { name: "Aide" }).click();

    await expect(
      page.getByRole("heading", { level: 1, name: "Aide" })
    ).toBeVisible();
    await expect(page.locator('[data-callout="help-shared"]')).toBeVisible();
    await expect(
      page.locator('[data-help-server="e2e-atelier"]')
    ).toContainText("ssh atelier");

    // The other sections wait folded under their caption, a table of contents.
    await expect(page.locator('[data-section="help-claude"]')).toHaveAttribute(
      "data-closed",
      ""
    );
    await expect(
      page.locator('[data-callout="help-module-ai.claude"]')
    ).toBeHidden();

    await assertAccessible(page, "aide");

    await page.getByRole("button", { name: "Claude Code" }).click();
    await page.getByRole("button", { name: "Codex" }).click();
    await page.getByRole("button", { name: "Votre éditeur" }).click();

    // Claude Code is on the fixture server, Codex is not: each says so.
    await expect(
      page.locator('[data-callout="help-module-ai.claude"]')
    ).toHaveAttribute("data-tone", "ok");
    await expect(
      page.locator('[data-callout="help-module-ai.codex"]')
    ).toHaveAttribute("data-tone", "warn");

    // The terminal steps open in the first project's folder.
    await expect(
      page.getByText("cd /home/dev/projects/flyleaf && claude")
    ).toBeVisible();
    await expect(
      page.getByText("zed://ssh/atelier/home/dev/projects/flyleaf")
    ).toBeVisible();

    await assertAccessible(page, "aide/ouverte");

    await page.getByRole("button", { name: "Ouvrir les services" }).click();
    await expect(page.locator('[data-service="db.postgres"]')).toBeVisible();
  });
});
