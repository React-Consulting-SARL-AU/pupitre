import { expect, test } from "@playwright/test";
import { assertAccessible } from "./harness/accessible";
import { launchPupitre, type Running } from "./harness/launch";

/**
 * The configuration of a declared project, reopened from its page.
 *
 * The overview lists every address the project answers on; the configuration
 * tab shows the same form as the add, filled from the project, and sends the
 * patch. The scenario publishes a second port and reads the agent's answer
 * under the form, against answers shaped like the contract.
 */
const FLYMATE_CARD = /^flymate-api/;

test.describe("la configuration d'un projet", () => {
  let running: Running;

  test.beforeAll(async () => {
    running = await launchPupitre();

    await running.app.evaluate(({ ipcMain }) => {
      const answer = (
        channel: string,
        reply: (...args: unknown[]) => unknown
      ) => {
        ipcMain.removeHandler(channel);
        ipcMain.handle(channel, (_event, ...args: unknown[]) => reply(...args));
      };

      const kept = globalThis as { updated?: unknown };

      answer("project:update", (_serverId, params) => {
        kept.updated = params;

        const sent = params as {
          name: string;
          patch: {
            cmd?: string;
            routes?: {
              label: string;
              port: number;
              subdomain?: string;
              hostname?: string;
            }[];
          };
        };

        return {
          ok: true,
          result: {
            branch: "main",
            cmd: sent.patch.cmd ?? "bun run dev --port 3000",
            dir: "flymate",
            host: "127.0.0.1",
            name: sent.name,
            path: "/home/dev/projects/flymate",
            pkgmgr: "bun",
            port: 3000,
            repo: "https://example.org/moi/flymate.git",
            routes: (sent.patch.routes ?? []).map(
              ({ label, port, subdomain, hostname }) => {
                const answered =
                  hostname ?? (subdomain ? `${subdomain}.example.org` : null);

                return {
                  label,
                  port,
                  ...(answered ? { hostname: answered } : {}),
                };
              }
            ),
            state: "online",
            url: "https://flymate.example.org",
          },
        };
      });

      answer("tunnel:records", () => ({ ok: true, result: 1 }));
    });
  });

  test.afterAll(async () => {
    await running.app.close();
  });

  test("rouvre la configuration et publie un second port", async () => {
    const { page } = running;

    await test.step("la page du projet liste ses adresses", async () => {
      await page.getByRole("button", { name: FLYMATE_CARD }).first().click();

      await expect(
        page.getByRole("heading", { name: "flymate-api" })
      ).toBeVisible();
      await expect(page.locator('[data-addresses="2"]')).toBeVisible();
      await expect(page.getByText("api-flymate.example.org")).toBeVisible();
    });

    await test.step("publier un autre port ouvre la configuration, préremplie", async () => {
      await page.getByRole("button", { name: "Publier un autre port" }).click();

      await expect(page.locator("#config\\.cmd")).toHaveValue(
        "bun run dev --port 3000"
      );
      await expect(page.locator("#project\\.ports\\.0\\.web")).toHaveValue(
        "flymate.example.org"
      );
      await expect(page.locator("#project\\.ports\\.1\\.web")).toHaveValue(
        "api-flymate.example.org"
      );
      await expect(
        page.getByRole("button", { name: "Enregistrer la configuration" })
      ).toBeDisabled();

      await assertAccessible(page, "projects/configuration");
    });

    await test.step("un port de plus se publie sous un nom dérivé", async () => {
      await page.getByRole("button", { name: "Ajouter un port" }).click();

      await expect(page.locator("#project\\.ports\\.2\\.label")).toHaveValue(
        "docs"
      );
      await expect(page.locator("#project\\.ports\\.2\\.web")).toHaveValue(
        "docs-flymate-api"
      );
      await expect(
        page.getByRole("button", { name: "Enregistrer la configuration" })
      ).toBeEnabled();
    });

    await test.step("un changement de commande dit que le projet redémarre", async () => {
      await page
        .locator("#config\\.cmd")
        .fill("bun run dev --port 3000 --host 127.0.0.1");

      await expect(page.getByText("redémarre le projet")).toBeVisible();
    });

    await test.step("la réponse de l'agent se lit sous le formulaire", async () => {
      await page
        .getByRole("button", { name: "Enregistrer la configuration" })
        .click();

      await expect(page.locator('[data-config="saved"]')).toBeVisible();
      await expect(
        page.getByText("flymate-api est réécrit dans le registre")
      ).toBeVisible();

      const updated = await running.app.evaluate(
        () => (globalThis as { updated?: unknown }).updated
      );

      expect(updated).toEqual({
        name: "flymate-api",
        patch: {
          cmd: "bun run dev --port 3000 --host 127.0.0.1",
          routes: [
            { hostname: "flymate.example.org", label: "web", port: 3000 },
            { hostname: "api-flymate.example.org", label: "api", port: 3001 },
            { label: "docs", port: 3002, subdomain: "docs-flymate-api" },
          ],
        },
      });

      await expect(page.locator("#project\\.ports\\.2\\.web")).toHaveValue(
        "docs-flymate-api.example.org"
      );
    });
  });
});
