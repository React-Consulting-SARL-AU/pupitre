import { expect, test } from "@playwright/test";
import { launchPupitre, type Running } from "./harness/launch";
import { answerOnboarding } from "./harness/onboarding";

/**
 * An onboarding left half-way and taken up again after a relaunch.
 *
 * The shelf remembers the step; the trail is put back as the earlier run must
 * have walked it, so the way back still stands: a resume on the catalogue goes
 * back to the inspection, and the rail counts the steps this machine walks.
 */
test.describe("la reprise d'un onboarding", () => {
  let running: Running;

  test.beforeAll(async () => {
    running = await launchPupitre();
    await answerOnboarding(running.app);

    // A machine that already runs the agent: the resumed sequence has no
    // agent step to walk, which is what the rail has to say.
    await running.app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler("inspection:probe");
      ipcMain.handle("inspection:probe", () => ({
        ok: true,
        result: {
          agent_version: "0.1.0",
          arch: "amd64",
          disk_free_gb: 80,
          docker: false,
          installed_modules: [],
          os: "Ubuntu",
          panel: null,
          ports: [],
          ram_mb: 4096,
          sudo: true,
          verdict: {
            fixes: [],
            kind: "managed",
            level: "ready",
            reasons: [],
            up_to_date: true,
          },
          version: "24.04",
        },
      }));
    });

    // What the earlier run had written down: the catalogue step, on the
    // harness's server, nothing installed yet.
    await running.page.evaluate(() => {
      window.localStorage.setItem(
        "pupitre.onboarding",
        JSON.stringify({
          installed: false,
          selected: [],
          serverId: "e2e-atelier",
          step: "catalog",
          values: {},
        })
      );
    });

    await running.page.reload();
    await running.page.evaluate(() => document.fonts.ready);
  });

  test.afterAll(async () => {
    await running.app.close();
  });

  test("rouvre sur l'étape reprise avec le bouton Retour", async () => {
    const { page } = running;

    await test.step("la séquence reprend sur le catalogue", async () => {
      await expect(
        page.locator('[data-step="catalog"] [data-current]')
      ).toBeVisible();
      await expect(page.getByText("Socle système").first()).toBeVisible();
    });

    await test.step("le rail compte les étapes de cette machine", async () => {
      await expect(page.locator("[data-step]")).toHaveCount(7);
      await expect(page.locator('[data-step="agent"]')).toHaveCount(0);
      await expect(page.getByText("Étape 3 sur 7")).toBeVisible();
    });

    await test.step("Retour ramène à l'inspection, puis au choix du serveur", async () => {
      await page.getByRole("button", { name: "Revenir" }).click();
      await expect(
        page.locator('[data-step="inspection"] [data-current]')
      ).toBeVisible();

      await page.getByRole("button", { name: "Revenir" }).click();
      await expect(
        page.locator('[data-step="server"] span[data-current]')
      ).toBeVisible();
      await expect(page.getByRole("button", { name: "Revenir" })).toHaveCount(
        0
      );
    });
  });
});
