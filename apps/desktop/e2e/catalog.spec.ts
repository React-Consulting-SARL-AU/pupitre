import { expect, test } from "@playwright/test";
import { assertAccessible } from "./harness/accessible";
import { launchPupitre, type Running, snapshotReads } from "./harness/launch";
import { answerOnboarding } from "./harness/onboarding";

/**
 * The catalogue, on a bare machine and on one that already runs services.
 *
 * It is the same screen in both places, and both are where a preset is worth
 * something: the shortcuts have to promise what they would really install
 * here, and the choice has to survive the snapshot the app polls underneath.
 */

const BOTH = ["amd64", "arm64"];

/** How many turns of the snapshot poll the choice has to survive. */
const POLLS = 2;

/** Comfortably more than those turns take, on a runner that is slow to draw. */
const POLLS_TIMEOUT_MS = 20_000;

const INSTALL = /^Installer$/;

const RICH = {
  modules: [
    {
      arch: BOTH,
      category: "core",
      conflicts: [],
      fields: [],
      id: "core.system",
      mandatory: true,
      name: "Socle système",
      requires: [],
      resources: { disk_mb: 1200, ram_mb: 256 },
      since: "0.1.0",
      summary: "Paquets de base, fuseau, utilisateur dev, identité git.",
    },
    {
      arch: BOTH,
      category: "runtime",
      conflicts: [],
      fields: [],
      id: "runtime.node",
      mandatory: false,
      name: "Node.js",
      requires: ["core.system"],
      resources: { disk_mb: 400, ram_mb: 128 },
      since: "0.1.0",
      summary: "Node par mise, pnpm et bun disponibles.",
    },
    {
      arch: BOTH,
      category: "database",
      conflicts: [],
      fields: [],
      id: "db.postgres",
      mandatory: false,
      name: "PostgreSQL",
      requires: ["core.system"],
      resources: { disk_mb: 900, ram_mb: 512 },
      since: "0.1.0",
      summary: "PostgreSQL en local, rôles applicatif et distant.",
    },
    {
      arch: BOTH,
      category: "database",
      conflicts: [],
      fields: [],
      id: "db.mysql",
      mandatory: false,
      name: "MySQL 8",
      requires: ["core.system"],
      resources: { disk_mb: 700, ram_mb: 512 },
      since: "0.1.0",
      summary: "MySQL 8 en local, base applicative prête.",
    },
    {
      arch: ["amd64"],
      category: "tool",
      conflicts: [],
      fields: [],
      id: "tool.legacy",
      mandatory: false,
      name: "Outil hérité",
      requires: ["core.system"],
      resources: { disk_mb: 200, ram_mb: 64 },
      since: "0.2.0",
      summary: "Binaire propriétaire livré pour amd64 seulement.",
    },
    {
      arch: BOTH,
      category: "exposure",
      conflicts: ["exposure.cloudflare"],
      fields: [],
      id: "exposure.caddy",
      mandatory: false,
      name: "Caddy",
      requires: ["core.system"],
      resources: { disk_mb: 120, ram_mb: 64 },
      since: "0.1.0",
      summary: "Reverse proxy, certificats automatiques.",
    },
    {
      arch: BOTH,
      category: "exposure",
      conflicts: ["exposure.caddy"],
      fields: [],
      id: "exposure.cloudflare",
      mandatory: false,
      name: "Cloudflare Tunnel",
      requires: ["core.system"],
      resources: { disk_mb: 80, ram_mb: 64 },
      since: "0.1.0",
      summary: "Sortie par tunnel, aucun port ouvert.",
    },
  ],
  presets: [
    {
      id: "web-js",
      modules: ["core.system", "runtime.node", "db.mysql"],
      name: "Web JavaScript",
    },
    {
      choose_one: ["exposure.caddy", "exposure.cloudflare"],
      id: "full",
      modules: [
        "core.system",
        "runtime.node",
        "db.mysql",
        "db.postgres",
        "tool.legacy",
      ],
      name: "Tout le catalogue",
    },
    { id: "minimal", modules: ["core.system"], name: "Minimal" },
  ],
};

test.describe("catalogue", () => {
  let running: Running;

  test.beforeAll(async () => {
    running = await launchPupitre();
    await answerOnboarding(running.app);
    await running.app.evaluate(({ ipcMain }, catalog) => {
      ipcMain.removeHandler("catalog:list");
      ipcMain.handle("catalog:list", () => ({ ok: true, result: catalog }));
    }, RICH);
  });

  test.afterAll(async () => {
    await running.app.close();
  });

  test("les préréglages et la recherche", async () => {
    const { page } = running;

    await page.getByRole("button", { name: "Réglages" }).click();
    await page.getByRole("tab", { name: "Serveurs" }).click();
    await page.getByRole("button", { name: "Installer Pupitre" }).click();
    await expect(page.getByText("Prêt à être installé")).toBeVisible();
    await page.getByRole("button", { name: INSTALL }).first().click();
    await expect(page.getByText("Agent en place")).toBeVisible();
    await page.getByRole("button", { name: "Choisir les services" }).click();
    await expect(page.getByText("Socle système").first()).toBeVisible();

    await test.step("un préréglage sans exclusif s'applique et se voit", async () => {
      await page.locator('[data-preset="web-js"]').click();

      await expect(page.locator('[data-preset="web-js"]')).toHaveAttribute(
        "data-preset-applied",
        "true"
      );
      await expect(
        page.locator('[data-module="runtime.node"]')
      ).toHaveAttribute("data-selected", "true");
      await expect(page.locator('[data-module="db.mysql"]')).toHaveAttribute(
        "data-selected",
        "true"
      );
    });

    await test.step("un préréglage exclusif demande, et laisse n'en prendre aucun", async () => {
      await page.locator('[data-preset="full"]').click();
      await expect(page.locator('[data-preset-choice="full"]')).toBeVisible();

      await page.locator('[data-preset-option="none"]').click();
      await page
        .locator('[data-preset-choice="full"]')
        .getByRole("button", { name: "Appliquer le préréglage" })
        .click();

      await expect(
        page.locator('[data-module="exposure.caddy"]')
      ).toHaveAttribute("data-selected", "false");
      await expect(page.locator('[data-module="db.postgres"]')).toHaveAttribute(
        "data-selected",
        "true"
      );
      await expect(page.locator('[data-preset="full"]')).toHaveAttribute(
        "data-preset-applied",
        "true"
      );
    });

    await test.step("la recherche resserre le catalogue", async () => {
      await page.getByLabel("Chercher dans le catalogue").fill("sql");

      await expect(page.locator("[data-category]")).toHaveCount(1);
      await expect(page.locator('[data-module="db.mysql"]')).toBeVisible();
      await expect(page.locator('[data-module="runtime.node"]')).toHaveCount(0);
      await expect(page.locator('[data-preset="full"]')).toHaveCount(0);
      await expect(page.locator("[data-search-found]")).toHaveText(
        "2 services trouvés"
      );
    });

    await test.step("elle dit quand elle n'a rien trouvé", async () => {
      await page.getByLabel("Chercher dans le catalogue").fill("kubernetes");

      await expect(
        page.getByText("Aucun service ne répond à « kubernetes ».")
      ).toBeVisible();
      await expect(page.locator("[data-search-found]")).toHaveText(
        "0 service trouvé"
      );
    });

    await test.step("Échap rend le catalogue entier", async () => {
      await page.getByLabel("Chercher dans le catalogue").press("Escape");

      await expect(page.locator('[data-preset="full"]')).toBeVisible();
      await expect(page.locator('[data-module="runtime.node"]')).toBeVisible();
    });

    await test.step("l'accessibilité de l'écran tient", async () => {
      await assertAccessible(page, "onboarding/catalog");
    });
  });
});

test.describe("catalogue sur une machine arm64", () => {
  let running: Running;

  test.beforeAll(async () => {
    running = await launchPupitre();
    await answerOnboarding(running.app);
    await running.app.evaluate(({ ipcMain }, catalog) => {
      ipcMain.removeHandler("catalog:list");
      ipcMain.handle("catalog:list", () => ({ ok: true, result: catalog }));
      ipcMain.removeHandler("inspection:probe");
      ipcMain.handle("inspection:probe", () => ({
        ok: true,
        result: {
          agent_version: null,
          arch: "arm64",
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
            kind: "bare",
            level: "ready",
            reasons: ["Aucun logiciel connu sur cette machine."],
          },
          version: "24.04",
        },
      }));
    }, RICH);
  });

  test.afterAll(async () => {
    await running.app.close();
  });

  test("un préréglage ne coche pas ce que l'architecture ne porte pas", async () => {
    const { page } = running;

    await page.getByRole("button", { name: "Réglages" }).click();
    await page.getByRole("tab", { name: "Serveurs" }).click();
    await page.getByRole("button", { name: "Installer Pupitre" }).click();
    await expect(page.getByText("Prêt à être installé")).toBeVisible();
    await page.getByRole("button", { name: INSTALL }).first().click();
    await expect(page.getByText("Agent en place")).toBeVisible();
    await page.getByRole("button", { name: "Choisir les services" }).click();
    await expect(page.getByText("Socle système").first()).toBeVisible();

    await page.locator('[data-preset="full"]').click();
    await page
      .locator('[data-preset-choice="full"]')
      .getByRole("button", { name: "Appliquer le préréglage" })
      .click();

    await expect(page.locator('[data-module="tool.legacy"]')).toHaveAttribute(
      "data-selected",
      "false"
    );
    await expect(page.locator('[data-module="tool.legacy"]')).toHaveAttribute(
      "data-blocked",
      "true"
    );
    await expect(page.locator('[data-module="db.postgres"]')).toHaveAttribute(
      "data-selected",
      "true"
    );
  });
});

test.describe("le catalogue sur un serveur déjà installé", () => {
  let running: Running;

  test.beforeAll(async () => {
    running = await launchPupitre();
    await running.app.evaluate(({ ipcMain }, catalog) => {
      ipcMain.removeHandler("catalog:list");
      ipcMain.handle("catalog:list", () => ({ ok: true, result: catalog }));
    }, RICH);
  });

  test.afterAll(async () => {
    await running.app.close();
  });

  test("ajoute un service sans perdre le choix sous le lecteur", async () => {
    const { page } = running;

    await page.getByRole("button", { name: "Services" }).click();
    await page.getByRole("button", { name: "Ajouter un service" }).click();

    await expect(page.locator('[data-preset="web-js"]')).toBeVisible();

    await test.step("un préréglage ne promet pas ce qui tourne déjà", async () => {
      await expect(page.locator('[data-module="db.postgres"]')).toHaveAttribute(
        "data-blocked",
        "true"
      );
      await page.locator('[data-preset="web-js"]').click();
      await expect(page.locator('[data-preset="web-js"]')).toHaveAttribute(
        "data-preset-applied",
        "true"
      );
    });

    await test.step("deux relèves du snapshot plus tard, le choix tient", async () => {
      const before = await snapshotReads(running.app);

      await expect
        .poll(() => snapshotReads(running.app), { timeout: POLLS_TIMEOUT_MS })
        .toBeGreaterThanOrEqual(before + POLLS);

      await expect(page.locator('[data-preset="web-js"]')).toHaveAttribute(
        "data-preset-applied",
        "true"
      );
      await expect(
        page.locator('[data-module="runtime.node"]')
      ).toHaveAttribute("data-selected", "true");
      await expect(
        page.getByRole("button", { name: "Continuer avec 3 services" })
      ).toBeVisible();
    });

    await test.step("la recherche est là aussi", async () => {
      await page.getByLabel("Chercher dans le catalogue").fill("caddy");

      await expect(
        page.locator('[data-module="exposure.caddy"]')
      ).toBeVisible();
      await expect(page.locator('[data-module="runtime.node"]')).toHaveCount(0);
    });

    await test.step("l'accessibilité de l'écran tient", async () => {
      await assertAccessible(page, "services/add");
    });
  });
});
