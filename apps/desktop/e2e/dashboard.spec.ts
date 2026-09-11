import { expect, test } from "@playwright/test";
import { SNAPSHOT } from "../src/renderer/src/__tests__/snapshot-fixtures";
import { assertAccessible } from "./harness/accessible";
import { ANSWERS } from "./harness/fixtures";
import { launchPupitre, type Running } from "./harness/launch";

/**
 * The dashboard's three gestures of the seventh phase: a figure past its line
 * says what to do, a service card opens its page, and a restart is waited on
 * by name until the machine answers again.
 */

const REBOOTING = /Redémarrage de/;

const STRAINED = {
  ...SNAPSHOT.machine,
  disk_free_gb: 8,
  load: [6.5, 5.2, 4.1] as [number, number, number],
  ram_used_mb: 7680,
};

test.describe("le tableau de bord", () => {
  let running: Running;

  test.beforeAll(async () => {
    running = await launchPupitre();

    await running.app.evaluate(
      (
        { ipcMain },
        fixtures: {
          answers: Record<string, unknown>;
          strained: typeof STRAINED;
        }
      ) => {
        const kept = globalThis as {
          snapshotReads?: number;
          strained?: boolean;
          rebooted?: number;
          silentReads?: number;
        };
        kept.strained = false;
        kept.rebooted = 0;
        kept.silentReads = 0;

        const snapshot = fixtures.answers.snapshot as { machine: unknown };

        ipcMain.removeHandler("agent:call");
        ipcMain.handle(
          "agent:call",
          (_event, _serverId: unknown, cmd: unknown) => {
            if (cmd === "snapshot") {
              kept.snapshotReads = (kept.snapshotReads ?? 0) + 1;

              // A machine that was told to reboot is silent for two reads.
              if ((kept.silentReads ?? 0) > 0) {
                kept.silentReads = (kept.silentReads ?? 0) - 1;

                return {
                  error: { code: "disconnected", message: "connexion fermée" },
                  ok: false,
                };
              }

              return {
                ok: true,
                result: kept.strained
                  ? { ...snapshot, machine: fixtures.strained }
                  : snapshot,
              };
            }

            if (cmd === "reboot") {
              kept.rebooted = (kept.rebooted ?? 0) + 1;
              kept.silentReads = 2;

              return { ok: true, result: {} };
            }

            const result = fixtures.answers[String(cmd)];

            return result === undefined
              ? {
                  error: {
                    code: "unknown_command",
                    message: `Le harnais n'a pas de réponse pour ${String(cmd)}.`,
                  },
                  ok: false,
                }
              : { ok: true, result };
          }
        );

        ipcMain.removeHandler("service:detail");
        ipcMain.handle("service:detail", () => ({
          ok: true,
          result: {
            configured: true,
            credentials: [],
            id: "db.postgres",
            name: "PostgreSQL",
            port: 5432,
            state: "running",
            unit: "postgresql.service",
            version: "17.2",
          },
        }));
      },
      { answers: ANSWERS as Record<string, unknown>, strained: STRAINED }
    );
  });

  test.afterAll(async () => {
    await running.app.close();
  });

  test("une carte de service ouvre sa fiche", async () => {
    const { page } = running;

    await expect(
      page.getByRole("heading", { level: 1, name: "1 projet en ligne" })
    ).toBeVisible();

    await page.locator('[data-service="db.postgres"]').click();

    await expect(
      page.getByRole("heading", { name: "PostgreSQL" })
    ).toBeVisible();
    await expect(page.getByText("17.2")).toBeVisible();

    // The landing is not a memory: the next visit opens on the list.
    await page.getByRole("button", { name: "Tableau de bord" }).click();
    await page.getByRole("button", { name: "Services" }).click();

    await expect(page.locator('[data-service="db.postgres"]')).toBeVisible();
    await expect(page.getByRole("heading", { name: "PostgreSQL" })).toHaveCount(
      0
    );
  });

  test("chaque jauge en alerte porte son remède", async () => {
    const { app, page } = running;

    await page.getByRole("button", { name: "Tableau de bord" }).click();
    await expect(page.locator("[data-remedy]")).toHaveCount(0);

    await app.evaluate(() => {
      (globalThis as { strained?: boolean }).strained = true;
    });

    await expect(page.locator('[data-remedy="memory"]')).toBeVisible();
    await expect(page.locator('[data-remedy="load"]')).toBeVisible();
    await expect(page.locator('[data-remedy="disk"]')).toBeVisible();
    await expect(page.locator('[data-alert="true"]')).toHaveCount(3);

    await assertAccessible(page, "tableau-de-bord/alertes");

    // The disk's remedy is a command of the agent: the button waits on it.
    await page
      .locator('[data-remedy="disk"]')
      .getByRole("button", { name: "Nettoyer les sessions" })
      .click();

    // The memory's remedy lands the reader on the projects, where one is
    // stopped by its own button.
    await page
      .locator('[data-remedy="memory"]')
      .getByRole("button", { name: "Arrêter un projet" })
      .click();

    await expect(page.getByRole("heading", { name: "Projets" })).toBeFocused();

    await app.evaluate(() => {
      (globalThis as { strained?: boolean }).strained = false;
    });

    await expect(page.locator("[data-remedy]")).toHaveCount(0);
  });

  test("un redémarrage est attendu par son nom, puis le tableau de bord revient", async () => {
    const { app, page } = running;

    await page.getByRole("button", { name: "Redémarrer le serveur" }).click();
    await page
      .getByRole("button", { exact: true, name: "Redémarrer" })
      .last()
      .click();

    await expect(page.locator("[data-rebooting]")).toBeVisible();
    await expect(page.getByText(REBOOTING)).toBeVisible();
    await expect(page.getByText("ne répond pas encore")).toHaveCount(0);

    await assertAccessible(page, "serveur/redemarrage");

    await expect(
      page.getByRole("heading", { level: 1, name: "1 projet en ligne" })
    ).toBeVisible({ timeout: 15_000 });

    expect(
      await app.evaluate(() => (globalThis as { rebooted?: number }).rebooted)
    ).toBe(1);
  });
});
