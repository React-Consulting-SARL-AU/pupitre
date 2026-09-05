import type { ElectronApplication } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { launchPupitre, type Running } from "./harness/launch";

/**
 * The invited member, from the settings to the machine.
 *
 * Only the platform is replaced: the window, the bridge and the stores are the
 * app's own. What the scenario watches is the promise of APP-15 — the server
 * arrives with its address, no field asks for one, and the first opening leads
 * straight to the customisation rather than to an installation.
 */

const CONSOLE_URL = "https://app.pupitre.test/dashboard";

const GRANTED_ID = "e2e-attribue";

const ADDRESS = "dev@192.0.2.20:22";

function stubFleet(app: ElectronApplication): Promise<void> {
  return app.evaluate(
    ({ ipcMain }, fixtures) => {
      const answer = (
        channel: string,
        reply: (...args: unknown[]) => unknown
      ) => {
        ipcMain.removeHandler(channel);
        ipcMain.handle(channel, (_event, ...args: unknown[]) => reply(...args));
      };

      const grant = {
        adopted: true,
        id: fixtures.grantedId,
        keyReady: true,
        listed: true,
        opened: false,
        status: "active",
      };
      const server = {
        grant,
        host: "192.0.2.20",
        hostFingerprint: "SHA256:pupitre-e2e",
        id: fixtures.grantedId,
        keyPath: "/dev/null",
        name: "atelier partagé",
        origin: "app",
        port: 22,
        user: "dev",
      };
      const config = { active: fixtures.grantedId, servers: [server] };

      answer("account:state", () => ({
        build: "production",
        checkedAt: new Date().toISOString(),
        consoleUrl: fixtures.consoleUrl,
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
            { id: "org-1", name: "Atelier Ada", role: "member", slug: "ada" },
            { id: "org-2", name: "Fonderie", role: "owner", slug: "fonderie" },
          ],
          role: "member",
        },
        sealed: true,
        usage: {
          entitlement: "valid",
          source: "platform",
          status: "granted",
          validUntil: new Date().toISOString(),
        },
      }));

      answer("servers", () => config);
      answer("fleet:list", () => ({
        ok: true,
        result: {
          adopted: [],
          changed: false,
          config,
          granted: [
            {
              host: server.host,
              hostFingerprint: server.hostFingerprint,
              id: server.id,
              keyReady: true,
              name: server.name,
              port: server.port,
              status: "active",
              user: server.user,
            },
          ],
          withdrawn: [],
        },
      }));
      answer("fleet:open", () => ({ ok: true, result: config }));
    },
    { consoleUrl: CONSOLE_URL, grantedId: GRANTED_ID }
  );
}

test.describe("serveur attribué", () => {
  let running: Running;

  test.beforeAll(async () => {
    running = await launchPupitre();
    await stubFleet(running.app);
    await running.page.reload();
  });

  test.afterAll(async () => {
    await running.app.close();
  });

  test("un membre invité l'ouvre sans saisir ni adresse ni clé", async () => {
    const { page } = running;

    await page.getByRole("button", { name: "Réglages" }).click();

    await expect(
      page.getByText("Attribués par votre organisation")
    ).toBeVisible();
    await expect(page.getByText(ADDRESS).first()).toBeVisible();
    await expect(page.getByText("Atelier Ada").first()).toBeVisible();

    await page.getByRole("button", { exact: true, name: "Ouvrir" }).click();

    await expect(page.getByText("Premier projet")).toBeVisible();
    await expect(page.getByText("atelier partagé").first()).toBeVisible();
  });
});
