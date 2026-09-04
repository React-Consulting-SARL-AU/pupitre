import {
  type ElectronApplication,
  expect,
  type Page,
  test,
} from "@playwright/test";
import { launchPupitre, type Running } from "./harness/launch";

/**
 * The banner, on the two servers that have something to say.
 *
 * The comparison is the main process's answer, so the scenario replaces that
 * one channel and leaves everything else — the window, the bridge, the stores —
 * as it ships. Nothing here talks to a machine.
 */

interface Update {
  carried: {
    arch: string;
    notes: string[];
    signed: boolean;
    version: string;
  } | null;
  installed: string;
  order: string;
}

const AHEAD: Update = {
  carried: {
    arch: "amd64",
    notes: ["Retour arrière si la nouvelle version ne répond pas."],
    signed: true,
    version: "0.4.0",
  },
  installed: "0.3.0",
  order: "ahead",
};

const BEHIND: Update = {
  carried: { arch: "amd64", notes: [], signed: true, version: "0.3.0" },
  installed: "0.9.0",
  order: "behind",
};

function announce(app: ElectronApplication, update: Update): Promise<void> {
  return app.evaluate(({ ipcMain }, answer: Update) => {
    ipcMain.removeHandler("agent-update:state");
    ipcMain.handle("agent-update:state", () => ({ ok: true, result: answer }));
  }, update);
}

async function reopen(page: Page): Promise<void> {
  await page.reload();
  await page.evaluate(() => document.fonts.ready);
}

test.describe("mise à jour de l'agent", () => {
  let running: Running;

  test.beforeAll(async () => {
    running = await launchPupitre();
  });

  test.afterAll(async () => {
    await running.app.close();
  });

  test("une app en avance propose la mise à jour en un clic", async () => {
    await announce(running.app, AHEAD);
    await reopen(running.page);

    const banner = running.page.locator("[data-update='ahead']");

    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Mise à jour disponible");
    await expect(banner).toContainText(
      "Retour arrière si la nouvelle version ne répond pas."
    );
    await expect(
      banner.getByRole("button", { name: "Mettre l'agent à jour" })
    ).toBeEnabled();
  });

  test("une app en retard le dit et laisse le tableau de bord vivant", async () => {
    await announce(running.app, BEHIND);
    await reopen(running.page);

    await expect(running.page.locator("[data-update='behind']")).toContainText(
      "Mettez l'app à jour"
    );
    await expect(
      running.page.getByRole("heading", { level: 1, name: "1 projet en ligne" })
    ).toBeVisible();
  });
});
