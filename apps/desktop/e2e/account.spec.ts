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

const MS_PER_DAY = 86_400_000;

/** A trial ending in `days` days, counted the way Stripe does: a day begun still counts. */
function trialEndingIn(days: number): string {
  return new Date(Date.now() + days * MS_PER_DAY - 3_600_000).toISOString();
}

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
          subscription: {
            current_period_end: fixtures.trialEndsAt,
            servers: { limit: 2, used: 1 },
            status: "trialing",
            trial_ends_at: fixtures.trialEndsAt,
          },
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

      const withTrial = (state: Record<string, unknown>, endsAt: string) => {
        const identity = state.identity as Record<string, unknown> | null;

        return identity
          ? {
              ...state,
              identity: {
                ...identity,
                subscription: {
                  current_period_end: endsAt,
                  servers: { limit: 2, used: 1 },
                  status: "trialing",
                  trial_ends_at: endsAt,
                },
              },
            }
          : state;
      };

      const clock = globalThis as { trialEndingSoon?: boolean };

      answer("account:state", () => current);
      // Once the scenario says so, the platform answers a trial about to end:
      // the card is read again from what it said, not from what it kept.
      answer("account:refresh", () => {
        if (clock.trialEndingSoon) {
          current = withTrial(current, fixtures.trialEndingSoon);
        }

        return current;
      });
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
    {
      approvalMs: APPROVAL_MS,
      consoleUrl: CONSOLE_URL,
      trialEndingSoon: trialEndingIn(2),
      trialEndsAt: trialEndingIn(5),
      userCode: USER_CODE,
    }
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

    // The app opens on the account: nothing about a machine sits behind it,
    // and a first launch is not a fault — the sign-in card is all it says.
    await expect(
      page.getByRole("heading", { name: "Connectez-vous pour ouvrir Pupitre" })
    ).toBeVisible();
    await expect(page.getByText("Aucun compte connecté")).toHaveCount(0);

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

    // The trial is the headline of the subscription: its days, in a calm tone
    // while there are enough of them.
    const subscription = page.locator("[data-subscription]");

    await expect(subscription).toHaveAttribute("data-subscription", "trialing");
    await expect(subscription.getByText("5 jours restants")).toBeVisible();
    await expect(subscription).toHaveAttribute("data-trial-tone", "ok");
    await expect(
      subscription.getByRole("button", { name: "Gérer l'abonnement" })
    ).toBeVisible();

    await assertAccessible(page, "reglages/compte");

    // Two days left: the same card turns to a warning and says what to do.
    await running.app.evaluate(() => {
      (globalThis as { trialEndingSoon?: boolean }).trialEndingSoon = true;
    });
    await page.getByRole("button", { name: "Actualiser" }).click();

    await expect(subscription.getByText("2 jours restants")).toBeVisible();
    await expect(subscription).toHaveAttribute("data-trial-tone", "warn");
    await expect(
      subscription.getByText("Choisissez une offre dans la console")
    ).toBeVisible();

    // Signing out is asked twice: the question says the terminals close too.
    await page.getByRole("button", { name: "Se déconnecter" }).click();
    await expect(page.getByText("chaque terminal ouvert")).toBeVisible();
    await page.getByRole("button", { name: "Se déconnecter" }).last().click();

    // Settings stay in front: it's where the account gets repaired.
    await page.getByRole("button", { name: "Compte" }).click();

    await expect(page.getByText("Aucun compte connecté")).toBeVisible();
  });
});
