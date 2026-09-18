import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { assertAccessible } from "./harness/accessible";
import { toggle } from "./harness/controls";
import { launchPupitre, type Running } from "./harness/launch";

/**
 * The three sections the seventh phase adds to the settings, against the real
 * bridge: the version the build carries, the updater's state as the main
 * process broadcasts it, and the two preferences it keeps in its own file. The
 * harness registers nothing with the system: a login item written here would
 * outlive the suite, and so would a line in the reader's own SSH file — the
 * one the SSH section writes lands in the folder the harness throws away.
 */

const VERSION = (
  JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8")
  ) as { version: string }
).version;

test.describe("les réglages de l'app", () => {
  let running: Running;

  test.beforeAll(async () => {
    running = await launchPupitre();
  });

  test.afterAll(async () => {
    await running.app.close();
  });

  test("À propos dit la version, et une mise à jour prête demande à redémarrer", async () => {
    const { app, page } = running;

    await page.getByRole("button", { name: "Réglages" }).click();
    await page.getByRole("tab", { name: "À propos" }).click();

    await expect(page.locator("[data-app-version]")).toHaveAttribute(
      "data-app-version",
      VERSION
    );
    // Built from the working tree, this copy follows no channel.
    await expect(page.getByText("Pas mise à jour par l'app")).toBeVisible();
    await expect(page.locator('[data-app-update="off"]')).toBeVisible();

    await assertAccessible(page, "reglages/a-propos");

    // What the updater would say once a download has landed.
    await app.evaluate(({ BrowserWindow }) => {
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send("app-update:changed", {
          status: "ready",
          updates: true,
          version: "0.9.0",
        });
      }
    });

    await expect(
      page.getByText("La version 0.9.0 est prête — redémarrez pour l'installer")
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Redémarrer maintenant" })
    ).toBeVisible();

    await app.evaluate(({ BrowserWindow }) => {
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send("app-update:changed", {
          error: "ENOTFOUND dl.pupitre.studio",
          status: "error",
          updates: true,
        });
      }
    });

    await expect(page.locator('[data-callout="app-update"]')).toContainText(
      "ENOTFOUND dl.pupitre.studio"
    );
    await expect(
      page.getByText("Vérifiez la connexion et réessayez")
    ).toBeVisible();
  });

  test("les notifications et le démarrage s'écrivent dans le fichier des préférences", async () => {
    const { app, page } = running;

    await page.getByRole("button", { name: "Réglages" }).click();
    await page.getByRole("tab", { name: "Notifications" }).click();

    const notifications = toggle(page, "Me prévenir quand une session attend");

    await expect(notifications).toBeChecked();
    await notifications.click();
    await expect(notifications).not.toBeChecked();

    await page.getByRole("tab", { name: "Démarrage" }).click();

    if (process.platform === "linux") {
      await expect(page.locator('[data-startup="unsupported"]')).toBeVisible();
    } else {
      const startup = toggle(page, "Ouvrir Pupitre à la connexion");

      await expect(startup).not.toBeChecked();
      await startup.click();
      await expect(startup).toBeChecked();
    }

    await assertAccessible(page, "reglages/demarrage");

    const userData = await app.evaluate(({ app: electron }) =>
      electron.getPath("userData")
    );
    const written = JSON.parse(
      readFileSync(join(userData, "preferences.json"), "utf8")
    ) as Record<string, unknown>;

    expect(written).toEqual({
      launchAtLogin: process.platform !== "linux",
      notifications: false,
      version: 2,
    });
  });

  test("la section SSH écrit une ligne Include en tête du fichier du système, et la retire", async () => {
    const { app, page } = running;

    await page.getByRole("button", { name: "Réglages" }).click();
    await page.getByRole("tab", { name: "SSH" }).click();

    const share = toggle(
      page,
      "Laisser ssh, mes éditeurs et mes agents de code joindre mes serveurs par leur nom"
    );

    await expect(share).not.toBeChecked();
    await assertAccessible(page, "reglages/ssh");

    const userData = await app.evaluate(({ app: electron }) =>
      electron.getPath("userData")
    );
    const file = join(userData, "home", ".ssh", "config");
    const line = await page.locator("[data-ssh-include]").innerText();

    expect(line.startsWith("Include ")).toBe(true);
    expect(line).toContain(join(userData, "ssh", "config"));
    expect(existsSync(file)).toBe(false);

    await share.click();
    await expect(share).toBeChecked();

    expect(readFileSync(file, "utf8")).toBe(`${line}\n`);

    await share.click();
    await expect(share).not.toBeChecked();

    expect(readFileSync(file, "utf8")).toBe("");
  });
});
