import { expect, test } from "@playwright/test";
import { launchPupitre, type Running } from "./harness/launch";
import { answerOnboarding } from "./harness/onboarding";

test.describe("resuming an onboarding", () => {
  let running: Running;

  test.beforeAll(async () => {
    running = await launchPupitre();
    await answerOnboarding(running.app);

    // The agent already runs, so the resumed sequence has no agent step.
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

  test("reopens on the resumed step with the Back button", async () => {
    const { page } = running;

    await test.step("the sequence resumes on the catalog", async () => {
      await expect(
        page.locator('[data-step="catalog"] [data-current]')
      ).toBeVisible();
      await expect(page.getByText("Socle système").first()).toBeVisible();
    });

    await test.step("the rail counts this machine's steps", async () => {
      await expect(page.locator("[data-step]")).toHaveCount(7);
      await expect(page.locator('[data-step="agent"]')).toHaveCount(0);
      await expect(page.getByText("Étape 3 sur 7")).toBeVisible();
    });

    await test.step("Back returns to the inspection, then to the server choice", async () => {
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
