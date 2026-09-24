import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { assertAccessible } from "./harness/accessible";
import {
  answerBackups,
  answerBucket,
  BACKUP_ID,
  installedConfigs,
  PASSPHRASE,
  sealInMemory,
} from "./harness/backups";
import { launchPupitre, type Running } from "./harness/launch";

/**
 * Backups, from the connection to a server taken back to one of them.
 *
 * The bucket's connection is kept by the real main process — the passphrase
 * derived there and dropped — so what this scenario reads back from the disk
 * is what the app actually left on it. The agent and the platform are the
 * harness's.
 */

const SECRET_KEY = "fake-secret-access-key-of-the-harness";

const BACKUP_DONE = /Sauvegarde terminée/;

const MONGODB_SILENT = /MongoDB n'a pas répondu/;

const HTTP_REFUSED =
  /en http, les signatures des requêtes passeraient en clair/;

const REVERTED = /Le serveur est revenu à la sauvegarde/;

/** Every file the app wrote, the link it keeps back to its own folder aside. */
function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    const entry = lstatSync(path);

    if (entry.isDirectory()) {
      return filesUnder(path);
    }

    return entry.isFile() ? [path] : [];
  });
}

test.describe("sauvegardes", () => {
  let running: Running;

  test.beforeAll(async () => {
    running = await launchPupitre();
    await sealInMemory(running.app);
    await answerBucket(running.app);
    await answerBackups(running.app, { docker: true, listed: false });
  });

  test.afterAll(async () => {
    await running.app.close();
  });

  test("la connexion garde le seau et la clé publique, jamais la phrase", async () => {
    const { app, page } = running;

    await page.getByRole("button", { name: "Réglages" }).click();
    await page.getByRole("tab", { name: "Connexions" }).click();
    await page.locator('[data-connection-row="backup"] button').first().click();

    const save = page.getByRole("button", { name: "Enregistrer la connexion" });

    await test.step("un point d'accès en http est refusé, pour sa raison", async () => {
      await page
        .locator("#backup-endpoint")
        .fill("http://acme.r2.cloudflarestorage.com");
      await page.locator("#backup-bucket").fill("pupitre-backups");
      await page.locator("#backup-access-key-id").fill("AKIA-E2E");
      await page.locator("#backup-secret-access-key").fill(SECRET_KEY);
      await save.click();

      await expect(page.getByText(HTTP_REFUSED)).toBeVisible();
      await page
        .locator("#backup-endpoint")
        .fill("https://acme.r2.cloudflarestorage.com");
    });

    await test.step("deux phrases qui diffèrent sont refusées sur place", async () => {
      await page.locator("#backup-passphrase").fill(PASSPHRASE);
      await page
        .locator("#backup-passphrase-confirm")
        .fill("autre chose encore");

      await expect(page.getByText("Les deux phrases diffèrent.")).toBeVisible();
      await page.locator("#backup-passphrase-confirm").fill(PASSPHRASE);
    });

    await test.step("un seau qui refuse l'écriture d'essai ne garde rien", async () => {
      await answerBucket(app, { code: "AccessDenied", status: 403 });
      await save.click();

      await expect(
        page.getByText(
          "Cette clé n'a pas le droit d'écrire dans ce seau, ou aucun seau ne porte ce nom."
        )
      ).toBeVisible();
      await answerBucket(app);
    });

    await save.click();

    await expect(
      page.getByText("Empreinte de la clé des sauvegardes")
    ).toBeVisible();
    await expect(
      page
        .locator('[data-connection-row="backup"]')
        .getByText("pupitre-backups")
    ).toHaveCount(2);

    await assertAccessible(page, "settings/backup-connection");

    const userData = await app.evaluate(({ app: electron }) =>
      electron.getPath("userData")
    );
    const written = filesUnder(userData).map((path) =>
      readFileSync(path).toString("latin1")
    );

    expect(written.some((text) => text.includes("pupitre-backups"))).toBe(true);
    expect(written.some((text) => text.includes(PASSPHRASE))).toBe(false);
    expect(written.some((text) => text.includes(SECRET_KEY))).toBe(false);
  });

  test("la page d'un serveur dit où en sont ses sauvegardes et en fait une", async () => {
    const { app, page } = running;

    await answerBackups(app, { docker: true });
    await page
      .getByRole("button", { exact: true, name: "Sauvegardes" })
      .click();

    await expect(
      page.getByRole("heading", { exact: true, name: "Sauvegardes" })
    ).toBeVisible();
    await expect(page.getByText("Toutes les 24 heures")).toBeVisible();
    await expect(
      page.getByText("Les volumes Docker ne sont pas dans les sauvegardes")
    ).toBeVisible();
    await expect(page.locator(`[data-backup="${BACKUP_ID}"]`)).toBeVisible();
    await test.step("le contenu se choisit base par base et projet par projet", async () => {
      const content = page.locator('[data-section="backup-contents"]');

      await expect(
        content.getByRole("checkbox", { name: "PostgreSQL · shop" })
      ).toBeChecked();
      await expect(
        content.getByRole("checkbox", { name: "Redis · instantané" })
      ).not.toBeChecked();
      await expect(
        content.getByRole("checkbox", { name: "MySQL · archives" })
      ).not.toBeChecked();
      await expect(content.getByText(MONGODB_SILENT)).toBeVisible();
      await expect(
        content.getByText("Sans dépôt : toujours sauvegardé en entier.")
      ).toBeVisible();

      await assertAccessible(page, "backups");

      await content
        .getByRole("checkbox", { name: "PostgreSQL · flymate" })
        .click();
      await content.getByRole("button", { name: "Appliquer" }).click();

      await expect
        .poll(async () => (await installedConfigs(app)).length)
        .toBe(1);

      const [sent] = await installedConfigs(app);

      expect(sent?.modules).toEqual(["core.backup"]);
      expect(sent?.config["core.backup"]?.exclude_databases).toEqual([
        "redis:*",
        "mysql:archives",
        "postgres:flymate",
      ]);
      expect(sent?.config["core.backup"]?.projects).toBe(true);
    });

    await page.getByRole("button", { name: "Sauvegarder maintenant" }).click();

    await expect(page.getByText(BACKUP_DONE)).toBeVisible();
  });

  test("revenir à une sauvegarde vérifie la phrase, puis mène jusqu'aux données", async () => {
    const { page } = running;

    await page
      .locator(`[data-backup="${BACKUP_ID}"]`)
      .getByRole("button", { name: "Revenir à cette sauvegarde" })
      .click();

    const dialog = page.locator('[data-dialog="backup-revert"]');

    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("checkbox", {
        name: "Sauvegarder l'état actuel d'abord",
      })
    ).toBeChecked();

    await test.step("une mauvaise phrase reste dans la question", async () => {
      await dialog
        .locator("#backup-revert-passphrase")
        .fill("pas la bonne phrase");
      await dialog
        .getByRole("button", { name: "Revenir à cette sauvegarde" })
        .click();

      await expect(
        dialog.getByText("Cette phrase de passe n'ouvre pas cette sauvegarde.")
      ).toBeVisible();
    });

    await dialog.locator("#backup-revert-passphrase").fill(PASSPHRASE);
    await dialog
      .getByRole("button", { name: "Revenir à cette sauvegarde" })
      .click();

    await expect(dialog).toBeHidden();
    await expect(
      page.getByText(
        "Le serveur fait tourner des services que la sauvegarde ne contient pas"
      )
    ).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "GitHub" })).toBeChecked();

    await page
      .getByRole("button", { name: "Désinstaller 1 service et continuer" })
      .click();

    await expect(page.getByText(REVERTED)).toBeVisible();
    await expect(page.getByText("intranet", { exact: true })).toBeVisible();
  });
});
