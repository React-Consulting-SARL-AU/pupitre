import type { ElectronApplication } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { assertAccessible } from "./harness/accessible";
import { ANSWERS } from "./harness/fixtures";
import { launchPupitre, type Running } from "./harness/launch";

const REPAIR = "Rattacher à nouveau ce serveur";

const SIGNED_IN = {
  build: "production",
  checkedAt: "2026-09-05T10:00:00Z",
  consoleUrl: "https://app.pupitre.test/dashboard",
  device: {
    fingerprint: "SHA256:pupitre-e2e",
    id: "e2e-device",
    name: "atelier",
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
  sealed: true,
  usage: {
    entitlement: "valid",
    source: "platform",
    status: "granted",
    validUntil: null,
  },
};

// Without a device there is nothing to ask a re-enrolment token with.
const WITHOUT_DEVICE = { ...SIGNED_IN, device: null };

interface Harness {
  account: unknown;
  answers: Record<string, unknown>;
}

function stubRestricted(
  app: ElectronApplication,
  repairable: boolean
): Promise<void> {
  return app.evaluate(
    ({ ipcMain }, harness: Harness) => {
      const state = globalThis as unknown as { pupitreRepaired?: boolean };

      state.pupitreRepaired = false;

      ipcMain.removeHandler("account:state");
      ipcMain.handle("account:state", () => harness.account);

      // The platform sync refreshes the account after the window opens and would restore the device.
      ipcMain.removeHandler("account:refresh");
      ipcMain.handle("account:refresh", () => harness.account);

      ipcMain.removeHandler("reenroll:start");
      ipcMain.handle("reenroll:start", () => {
        state.pupitreRepaired = true;

        return { ok: true, result: { enrolled: true, entitlement: "valid" } };
      });

      ipcMain.removeHandler("agent:call");
      ipcMain.handle(
        "agent:call",
        (_event, _serverId: unknown, cmd: unknown) => {
          const result = harness.answers[String(cmd)];

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
                ? {
                    ...(result as object),
                    entitlement: state.pupitreRepaired ? "valid" : "restricted",
                  }
                : result,
          };
        }
      );
    },
    {
      account: repairable ? SIGNED_IN : WITHOUT_DEVICE,
      answers: ANSWERS as Record<string, unknown>,
    }
  );
}

test.describe("serveur en mode restreint", () => {
  let running: Running;

  test.beforeAll(async () => {
    running = await launchPupitre();
    await stubRestricted(running.app, false);
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

    await expect(
      page.getByRole("button", { name: "Tableau de bord" })
    ).toBeVisible();
    await expect(page.getByText("flyleaf-api").first()).toBeVisible();

    await assertAccessible(page, "serveur/restreint");
  });

  test("n'offre pas le ré-enrôlement à un appareil sans compte", async () => {
    await expect(
      running.page.getByRole("button", { name: REPAIR })
    ).toBeHidden();
  });
});

test.describe("réparer un serveur restreint depuis l'app", () => {
  let running: Running;

  test.beforeAll(async () => {
    running = await launchPupitre();
    await stubRestricted(running.app, true);
    await running.page.reload();
  });

  test.afterAll(async () => {
    await running.app.close();
  });

  test("rend le serveur à son droit d'usage sans passer par la console", async () => {
    const { page } = running;

    await expect(
      page.getByText("se laisse lire, et refuse tout le reste")
    ).toBeVisible();

    await page.getByRole("button", { name: REPAIR }).click();

    await expect(
      page.getByText("se laisse lire, et refuse tout le reste")
    ).toBeHidden();

    await expect(page.getByText("flyleaf-api").first()).toBeVisible();
    await expect(page.getByRole("button", { name: REPAIR })).toBeHidden();
  });
});
