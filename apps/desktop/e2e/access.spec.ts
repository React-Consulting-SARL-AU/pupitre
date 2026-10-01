import { expect, test } from "@playwright/test";
import { SNAPSHOT } from "../src/renderer/src/__tests__/snapshot-fixtures";
import { assertAccessible } from "./harness/accessible";
import { openServerPage } from "./harness/controls";
import { launchPupitre, type Running } from "./harness/launch";

const FLYLEAF_CARD = /^flyleaf-api/;

const [flyleaf, ...others] = SNAPSHOT.projects;

// A server whose agent has the gate: every project protected, a webhook receiver left public.
const GATED = {
  ...SNAPSHOT,
  projects: [
    {
      ...flyleaf,
      processes: [
        ...(flyleaf?.processes ?? []),
        {
          cmd: "bun run hooks --port 3050",
          dir: "hooks",
          host: "127.0.0.1",
          id: "hooks",
          path: "/home/dev/projects/flyleaf/hooks",
          pkgmgr: "bun",
          port: 3050,
          protected: false,
          routes: [
            {
              hostname: "hooks-flyleaf.example.org",
              label: "hooks",
              port: 3050,
            },
          ],
          state: "online",
        },
      ],
      protected: true,
    },
    ...others.map((project) => ({ ...project, protected: true })),
  ],
};

test.describe("access to published addresses", () => {
  let running: Running;

  test.beforeAll(async () => {
    running = await launchPupitre();

    await running.app.evaluate((_electron, snapshot) => {
      const held = globalThis as { answers?: Record<string, unknown> };

      if (held.answers) {
        held.answers.snapshot = snapshot;
      }
    }, GATED);

    await running.page.reload();
  });

  test.afterAll(async () => {
    await running.app.close();
  });

  test("protects the project, leaves a webhook receiver public, and creates a key", async () => {
    const { page } = running;

    await test.step("the configuration is split into parts, access among them", async () => {
      await page.getByRole("button", { name: FLYLEAF_CARD }).first().click();
      await page.getByRole("tab", { name: "Configuration" }).click();
      await page.getByRole("tab", { name: "Accès" }).click();

      await expect(
        page.getByRole("switch", { name: "Protéger le projet" })
      ).toBeChecked();
      await expect(
        page.getByRole("combobox", { name: "Accès de hooks" })
      ).toContainText("Toujours public");
      await expect(page.locator("[data-access-key]")).toHaveCount(2);

      await assertAccessible(page, "projects/configuration/access");
    });

    await test.step("a new key opens on this project, then is copied", async () => {
      await page.getByRole("button", { name: "Nouvelle clé" }).click();
      await page.getByLabel("Nom de la clé").fill("Simulateur iPhone");
      await page.getByRole("button", { name: "Créer la clé" }).click();

      await expect(page.getByText("Clé Simulateur iPhone créée")).toBeVisible();

      await page.getByRole("button", { name: "En-tête Pupitre-Key" }).click();

      await expect(page.getByText("En-tête copié")).toBeVisible();

      await page.getByRole("button", { name: "Terminé" }).click();
    });

    await test.step("the server's Access page lists all its keys", async () => {
      await openServerPage(page, "Accès");

      await expect(
        page.getByRole("heading", { exact: true, name: "Accès" })
      ).toBeVisible();
      await expect(page.getByText("Tout le serveur")).toBeVisible();

      await assertAccessible(page, "access");
    });
  });
});
