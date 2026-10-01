import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { assertAccessible } from "./harness/accessible";
import {
  answerBackups,
  answerBucket,
  BACKUP_ID,
  installedConfigs,
  markRunning,
  PASSPHRASE,
  sealInMemory,
  streamedCalls,
} from "./harness/backups";
import { openServerPage } from "./harness/controls";
import { launchPupitre, type Running } from "./harness/launch";

const SECRET_KEY = "fake-secret-access-key-of-the-harness";

const BACKUP_DONE = /Sauvegarde terminée/;

const MONGODB_SILENT = /MongoDB n'a pas répondu/;

const HTTP_REFUSED =
  /en http, les signatures des requêtes passeraient en clair/;

const REVERTED = /Le serveur est revenu à la sauvegarde/;

const WEEKS_KEPT = /Environ 14 semaines d'historique/;

const DRIFT = /Ce serveur sauvegarde avec un autre bucket ou une autre clé/;

// lstat, so the link the app keeps back to its own folder is not followed.
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

test.describe("backups", () => {
  let running: Running;

  test.beforeAll(async () => {
    running = await launchPupitre();
    await sealInMemory(running.app);
    await answerBucket(running.app);
    await answerBackups(running.app, {
      configured: false,
      docker: true,
      listed: false,
    });
  });

  test.afterAll(async () => {
    await running.app.close();
  });

  test("setup keeps the bucket and the public key, never the passphrase, then enables backups", async () => {
    const { app, page } = running;

    await openServerPage(page, "Sauvegardes");

    const setup = page.locator('[data-section="backup-setup"]');
    const next = setup.getByRole("button", { name: "Continuer" });

    await expect(
      page.getByRole("button", { name: "Sauvegarder maintenant" })
    ).toHaveCount(0);
    await assertAccessible(page, "backups-setup");

    await test.step("an http endpoint is refused, with its reason", async () => {
      await page.getByRole("radio", { name: "Autre service S3" }).click();
      await page
        .locator("#backup-endpoint")
        .fill("http://acme.r2.cloudflarestorage.com");
      await page.locator("#backup-bucket").fill("pupitre-backups");
      await page.locator("#backup-access-key-id").fill("AKIA-E2E");
      await page.locator("#backup-secret-access-key").fill(SECRET_KEY);
      await next.click();

      await expect(page.getByText(HTTP_REFUSED)).toBeVisible();
      await page
        .locator("#backup-endpoint")
        .fill("https://acme.r2.cloudflarestorage.com");
    });

    await test.step("a bucket that refuses the test write stops at the first step", async () => {
      await answerBucket(app, { code: "AccessDenied", status: 403 });
      await next.click();

      await expect(
        page.getByText(
          "Cette clé n'a pas le droit d'écrire dans ce bucket, ou aucun bucket ne porte ce nom."
        )
      ).toBeVisible();
      await answerBucket(app);
      await next.click();
    });

    await test.step("two passphrases that differ are refused in place", async () => {
      await page.locator("#backup-passphrase").fill(PASSPHRASE);
      await page
        .locator("#backup-passphrase-confirm")
        .fill("autre chose encore");

      await expect(
        page.getByText("Les deux passphrases diffèrent.")
      ).toBeVisible();
      await page.locator("#backup-passphrase-confirm").fill(PASSPHRASE);
      await next.click();
    });

    await test.step("frequency is chosen in words, retention is stated in time", async () => {
      await setup.getByRole("combobox", { name: "Fréquence" }).click();
      await page.getByRole("option", { name: "Chaque semaine" }).click();

      await expect(setup.getByText(WEEKS_KEPT)).toBeVisible();
      await assertAccessible(page, "backups-setup-frequency");
    });

    const userData = await app.evaluate(({ app: electron }) =>
      electron.getPath("userData")
    );
    const written = filesUnder(userData).map((path) =>
      readFileSync(path).toString("latin1")
    );

    expect(written.some((text) => text.includes("pupitre-backups"))).toBe(true);
    expect(written.some((text) => text.includes(PASSPHRASE))).toBe(false);
    expect(written.some((text) => text.includes(SECRET_KEY))).toBe(false);

    await next.click();
    await setup
      .locator('[data-setup="content"]')
      .getByRole("checkbox", { name: "PostgreSQL · flyleaf" })
      .click();
    await setup
      .getByRole("button", { name: "Activer les sauvegardes" })
      .click();

    await expect.poll(async () => (await installedConfigs(app)).length).toBe(1);

    const [sent] = await installedConfigs(app);

    expect(sent?.config["core.backup"]?.interval_hours).toBe(168);
    expect(sent?.config["core.backup"]?.exclude_databases).toEqual([
      "postgres:flyleaf",
    ]);
    await expect(page.getByText(BACKUP_DONE)).toBeVisible();
    await expect(setup).toHaveCount(0);
  });

  test("a server's page says where its backups stand and takes one", async () => {
    const { app, page } = running;

    await answerBackups(app, { docker: true });
    await markRunning(app, true);
    await page.getByRole("button", { name: "Services" }).click();
    await openServerPage(page, "Sauvegardes");

    await test.step("the dashboard shows what is running, the last backup and the next", async () => {
      await expect(
        page.getByRole("tab", { name: "Vue d'ensemble" })
      ).toHaveAttribute("aria-selected", "true");
      await expect(
        page.getByText("Une sauvegarde de ce serveur est en cours.")
      ).toBeVisible();
      await expect(
        page.locator('[data-section="backup-status"]').getByText("Chaque jour")
      ).toBeVisible();
      await expect(
        page.getByText("Les volumes Docker ne sont pas dans les sauvegardes")
      ).toBeVisible();
      await expect(page.locator(`[data-backup="${BACKUP_ID}"]`)).toBeVisible();
      await expect(
        page.locator('[data-section="backup-contents"]')
      ).toHaveCount(0);
      await assertAccessible(page, "backups");
      await markRunning(app, false);
    });

    await test.step("content is chosen database by database and project by project", async () => {
      await page.getByRole("tab", { name: "Contenu" }).click();

      const content = page.locator('[data-section="backup-contents"]');

      await expect(
        content.getByRole("checkbox", { name: "PostgreSQL · shop" })
      ).toBeChecked();
      await expect(
        content.getByRole("checkbox", { name: "Redis · snapshot" })
      ).not.toBeChecked();
      await expect(
        content.getByRole("checkbox", { name: "MySQL · archives" })
      ).not.toBeChecked();
      await expect(content.getByText(MONGODB_SILENT)).toBeVisible();
      await expect(
        content.getByText("Sans dépôt : toujours sauvegardé en entier.")
      ).toBeVisible();

      await assertAccessible(page, "backups/content");

      await content
        .getByRole("checkbox", { name: "PostgreSQL · flyleaf" })
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
        "postgres:flyleaf",
      ]);
      expect(sent?.config["core.backup"]?.projects).toBe(true);
    });

    await test.step("a manual backup is named, or keeps its date", async () => {
      await page
        .getByRole("button", { name: "Sauvegarder maintenant" })
        .click();

      const dialog = page.locator('[data-dialog="backup-name"]');

      await expect(dialog).toBeVisible();
      await dialog.locator("#backup-name").fill(" avant la migration ");
      await assertAccessible(page, "backups/name");
      await dialog.getByRole("button", { name: "Sauvegarder" }).click();

      await expect(page.getByText(BACKUP_DONE)).toBeVisible();

      const run = (await streamedCalls(app)).find(
        (call) => call.cmd === "backup.run"
      );

      expect(run?.params).toEqual({ name: "avant la migration" });
    });
  });

  test("restoring a backup checks the passphrase, then leads to the data", async () => {
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

    await test.step("a wrong passphrase stays in the question", async () => {
      await dialog
        .locator("#backup-revert-passphrase")
        .fill("pas la bonne phrase");
      await dialog
        .getByRole("button", { name: "Revenir à cette sauvegarde" })
        .click();

      await expect(
        dialog.getByText("Cette passphrase n'ouvre pas cette sauvegarde.")
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

    const progress = page.locator('[data-dialog="backup-revert-progress"]');

    await test.step("the restore holds the window: Escape does not close it", async () => {
      await page.keyboard.press("Escape");

      await expect(progress).toBeVisible();
    });

    await page
      .getByRole("button", { name: "Désinstaller 1 service et continuer" })
      .click();

    await expect(progress.getByText(REVERTED)).toBeVisible();
    await expect(progress.getByText("intranet", { exact: true })).toBeVisible();
    await assertAccessible(page, "backups/revert-done");
    await progress.getByRole("button", { name: "Fermer" }).click();
    await expect(progress).toBeHidden();
  });

  test("the destination says what the server holds, aligns it, and everything can start over", async () => {
    const { app, page } = running;

    await answerBackups(app, { docker: true });
    await page.getByRole("button", { name: "Services" }).click();
    await openServerPage(page, "Sauvegardes");
    await page.getByRole("tab", { name: "Destination" }).click();

    const destination = page.locator('[data-section="backup-destination"]');

    await expect(destination.getByText("AKIA-SERVER")).toBeVisible();
    await expect(page.getByText(DRIFT)).toBeVisible();
    await assertAccessible(page, "backups/destination");

    await destination
      .getByRole("button", { name: "Appliquer la connexion de cet ordinateur" })
      .click();
    await expect.poll(async () => (await installedConfigs(app)).length).toBe(1);

    await test.step("resetting removes the module and restarts setup", async () => {
      await page
        .getByRole("button", { name: "Réinitialiser les sauvegardes" })
        .click();
      await page
        .getByRole("button", { exact: true, name: "Réinitialiser" })
        .click();

      await expect(page.locator('[data-section="backup-setup"]')).toBeVisible();
      await expect(page.locator("#backup-r2-account")).toBeVisible();

      const uninstall = (await streamedCalls(app)).find(
        (call) => call.cmd === "uninstall"
      );

      expect(uninstall?.params).toEqual({ modules: ["core.backup"] });
    });
  });
});
