import type { ElectronApplication } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { assertAccessible } from "./harness/accessible";
import { launchPupitre, type Running } from "./harness/launch";

const CONSOLE_URL = "https://app.pupitre.test/dashboard";

const NO_ACCOUNT = {
  build: "production",
  checkedAt: null,
  consoleUrl: CONSOLE_URL,
  device: null,
  identity: null,
  refusal: {
    code: "license_required",
    fix: `Connecte-toi depuis les réglages, ou ouvre la console : ${CONSOLE_URL}`,
    message: "Installer un serveur demande un compte Pupitre.",
  },
  sealed: true,
  usage: { consoleUrl: CONSOLE_URL, status: "absent" },
};

const EIGHTH_DAY = {
  ...NO_ACCOUNT,
  checkedAt: "2026-08-01T10:00:00.000Z",
  refusal: {
    code: "license_required",
    fix: `Reconnecte cet appareil, ou vérifie l'état du compte : ${CONSOLE_URL}`,
    message:
      "La console n'a pas répondu depuis plus de sept jours : la licence doit être vérifiée à nouveau.",
  },
  usage: {
    consoleUrl: CONSOLE_URL,
    since: "2026-08-01T10:00:00.000Z",
    status: "stale",
  },
};

function stubAccount(
  app: ElectronApplication,
  account: Record<string, unknown>
): Promise<void> {
  return app.evaluate(({ ipcMain }, state) => {
    for (const channel of ["account:state", "account:refresh"]) {
      ipcMain.removeHandler(channel);
      ipcMain.handle(channel, () => state);
    }
  }, account);
}

test.describe("premier lancement", () => {
  let running: Running;

  test.beforeEach(async () => {
    running = await launchPupitre();
  });

  test.afterEach(async () => {
    await running.app.close();
  });

  test("un build sans compte n'ouvre ni onboarding, ni serveur, ni terminal", async () => {
    const { app, page } = running;

    await stubAccount(app, NO_ACCOUNT);
    await page.reload();

    await expect(
      page.getByRole("heading", { name: "Connectez-vous pour ouvrir Pupitre" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Se connecter" })
    ).toBeVisible();
    await expect(page.getByText("Aucun compte connecté")).toHaveCount(0);
    await expect(page.getByText(NO_ACCOUNT.refusal.fix)).toHaveCount(0);

    await assertAccessible(page, "compte/porte");

    await expect(
      page.getByRole("button", { name: "Tableau de bord" })
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Terminaux" })).toHaveCount(
      0
    );
    await expect(page.getByRole("button", { name: "Projets" })).toHaveCount(0);
    await expect(page.getByText("atelier")).toHaveCount(0);

    await page.getByRole("button", { name: "Ouvrir les réglages" }).click();

    await expect(page.getByRole("heading", { name: "Réglages" })).toBeVisible();

    await page.getByRole("tab", { name: "Compte" }).click();

    await expect(
      page.getByRole("button", { name: "Se connecter" })
    ).toBeVisible();
  });

  test("au-delà de sept jours l'app revient au compte et dit le refus tel quel", async () => {
    const { app, page } = running;

    await stubAccount(app, EIGHTH_DAY);
    await page.reload();

    await expect(
      page.getByRole("heading", { name: "Connectez-vous pour ouvrir Pupitre" })
    ).toBeVisible();
    await expect(page.getByText("Vérification expirée")).toBeVisible();
    await expect(
      page.getByText("au-delà des sept jours de tolérance")
    ).toBeVisible();
    await expect(page.getByText(EIGHTH_DAY.refusal.message)).toHaveCount(0);
  });
});
