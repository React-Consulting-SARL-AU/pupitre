import type { ElectronApplication } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { assertAccessible } from "./harness/accessible";
import { launchPupitre, type Running } from "./harness/launch";

/**
 * The account screen, from a packaged build that refuses to install without one
 * to the identity the console confirmed. Only the platform is replaced: the
 * window, the bridge and the store are the app's own.
 */

const USER_CODE = "WDJB-MJHT";

const CONSOLE_URL = "https://app.pupitre.test/dashboard";

const APPROVAL_MS = 300;

function stubAccount(app: ElectronApplication): Promise<void> {
  return app.evaluate(
    ({ ipcMain }, fixtures) => {
      const signedOut: Record<string, unknown> = {
        build: "production",
        checkedAt: null,
        consoleUrl: fixtures.consoleUrl,
        device: null,
        identity: null,
        refusal: {
          code: "entitlement_required",
          fix: `Connecte-toi depuis les réglages, ou ouvre la console : ${fixtures.consoleUrl}`,
          message: "Installer un serveur demande un compte Pupitre.",
        },
        sealed: true,
        usage: { consoleUrl: fixtures.consoleUrl, status: "absent" },
      };
      const signedIn: Record<string, unknown> = {
        ...signedOut,
        checkedAt: new Date().toISOString(),
        device: {
          fingerprint: "SHA256:pupitre-e2e",
          id: "device-1",
          name: "MacBook",
          publicKey: "ssh-ed25519 AAAA",
        },
        identity: {
          email: "ada@pupitre.studio",
          entitlement: "valid",
          name: "Ada Lovelace",
          organization: { id: "org-1", name: "Atelier Ada", slug: "ada" },
          organizations: [
            { id: "org-1", name: "Atelier Ada", role: "owner", slug: "ada" },
          ],
          role: "owner",
        },
        refusal: null,
        usage: {
          entitlement: "valid",
          source: "platform",
          status: "granted",
          validUntil: new Date().toISOString(),
        },
      };

      let current = signedOut;

      const answer = (
        channel: string,
        reply: (...args: unknown[]) => unknown
      ) => {
        ipcMain.removeHandler(channel);
        ipcMain.handle(channel, (_event, ...args: unknown[]) => reply(...args));
      };

      answer("account:state", () => current);
      answer("account:refresh", () => current);
      answer("account:sign-out", () => {
        current = signedOut;

        return current;
      });

      ipcMain.removeHandler("account:sign-in");
      ipcMain.handle("account:sign-in", (event, token: unknown) => {
        const send = (progress: unknown) =>
          event.sender.send("account:sign-in-progress", { progress, token });

        send({ kind: "starting" });
        send({
          kind: "code",
          userCode: fixtures.userCode,
          verificationUri: fixtures.consoleUrl,
          verificationUriComplete: fixtures.consoleUrl,
        });
        send({ kind: "waiting" });

        return new Promise((resolve) => {
          setTimeout(() => {
            current = signedIn;
            resolve({ ok: true, result: signedIn });
          }, fixtures.approvalMs);
        });
      });
    },
    { approvalMs: APPROVAL_MS, consoleUrl: CONSOLE_URL, userCode: USER_CODE }
  );
}

test.describe("compte", () => {
  let running: Running;

  test.beforeAll(async () => {
    running = await launchPupitre();
    await stubAccount(running.app);
    await running.page.reload();
  });

  test.afterAll(async () => {
    await running.app.close();
  });

  test("le device flow mène de l'écran de compte à l'identité confirmée", async () => {
    const { page } = running;

    // The app opens on the account: nothing about a machine sits behind it.
    await expect(page.getByText("Aucun compte connecté")).toBeVisible();
    await expect(
      page.getByText("refuse d'installer un serveur sans compte")
    ).toBeVisible();

    await page.getByRole("button", { name: "Se connecter" }).click();

    await expect(page.getByText(USER_CODE)).toBeVisible();
    await expect(
      page.getByText("En attente de votre approbation")
    ).toBeVisible();

    await expect(
      page.getByRole("button", { name: "Tableau de bord" })
    ).toBeVisible();

    await page.getByRole("button", { name: "Réglages" }).click();
    await page.getByRole("button", { name: "Compte" }).click();

    await expect(page.getByText("ada@pupitre.studio")).toBeVisible();
    await expect(page.getByText("Abonnement actif")).toBeVisible();
    await expect(page.getByText("Atelier Ada")).toBeVisible();

    await assertAccessible(page, "reglages/compte");

    await page.getByRole("button", { name: "Se déconnecter" }).click();

    // Settings stay in front: it's where the account gets repaired.
    await page.getByRole("button", { name: "Compte" }).click();

    await expect(page.getByText("Aucun compte connecté")).toBeVisible();
  });
});
