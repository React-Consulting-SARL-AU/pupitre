import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { assertAccessible } from "./harness/accessible";
import { toggle } from "./harness/controls";
import { SERVERS } from "./harness/fixtures";
import { launchPupitre, type Running } from "./harness/launch";

const VERSION = (
  JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8")
  ) as { version: string }
).version;

test.describe("the app's settings", () => {
  let running: Running;

  test.beforeAll(async () => {
    running = await launchPupitre();
  });

  test.afterAll(async () => {
    await running.app.close();
  });

  test("About says the version, and a ready update asks to restart", async () => {
    const { app, page } = running;

    await page.getByRole("button", { name: "Réglages" }).click();
    await page.getByRole("tab", { name: "À propos" }).click();

    await expect(page.locator("[data-app-version]")).toHaveAttribute(
      "data-app-version",
      VERSION
    );
    // Built from the working tree, this copy follows no update channel.
    await expect(page.getByText("Pas mise à jour par l'app")).toBeVisible();
    await expect(page.locator('[data-app-update="off"]')).toBeVisible();

    await assertAccessible(page, "reglages/a-propos");

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
          failure: "refused",
          status: "error",
          updates: true,
          version: "0.9.0",
        });
      }
    });

    await expect(page.locator('[data-callout="app-update"]')).toContainText(
      "La version 0.9.0 ne porte pas la signature de release de Pupitre"
    );
    await expect(
      page.getByText("téléchargez Pupitre depuis pupitre.studio")
    ).toBeVisible();
  });

  test("notifications and startup are written to the preferences file", async () => {
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

  test("a server whose agent answers after the settings open stops offering installation", async () => {
    const { app, page } = running;

    await page.getByRole("button", { name: "Réglages" }).click();
    await page.getByRole("tab", { name: "Serveurs" }).click();

    const entry = page.locator("[data-onboarding-entry]");

    // The harness answers agent:call itself, so no channel greets until one is announced.
    await expect(entry).toBeVisible();

    await app.evaluate(({ BrowserWindow }, serverId) => {
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send("agent:channel", { serverId, state: "open" });
      }
    }, SERVERS.servers[0].id);

    await expect(entry).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Installer Pupitre" })
    ).toHaveCount(0);
  });

  test("the SSH section writes an Include line at the top of the system file, and removes it", async () => {
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
    // The harness keeps the system SSH file inside the throwaway user folder.
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
