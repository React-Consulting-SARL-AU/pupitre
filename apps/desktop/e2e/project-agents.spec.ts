import { expect, test } from "@playwright/test";
import { assertAccessible } from "./harness/accessible";
import { launchPupitre, type Running } from "./harness/launch";

const FLYLEAF_CARD = /^flyleaf-api/;
const CLAUDE_CARD = /Claude/;
const AGENTS_TAB = /^Agents/;
const CLOSE_AND_STOP = /^Fermer l'onglet et arrêter la session/;

test.describe("a project's Agents tab", () => {
  let running: Running;

  test.beforeAll(async () => {
    running = await launchPupitre();

    await running.app.evaluate(({ ipcMain }) => {
      const kept = globalThis as { opened?: unknown[]; ended?: unknown[] };

      kept.opened = [];
      kept.ended = [];
      ipcMain.removeHandler("terminal-open");
      ipcMain.handle("terminal-open", (_event, ...args: unknown[]) => {
        kept.opened?.push(args);

        return { ok: true, result: { session: "claude-flyleaf-api" } };
      });
      ipcMain.removeAllListeners("terminal-close");
      ipcMain.on("terminal-close", (_event, ...args: unknown[]) => {
        kept.ended?.push(args);
      });
    });
  });

  test.afterAll(async () => {
    await running.app.close();
  });

  test("offers the machine's agents, launches the one pressed, and closes its tab when it exits", async () => {
    const { page } = running;

    await page.getByRole("button", { name: FLYLEAF_CARD }).first().click();

    await expect(
      page.getByRole("heading", { name: "flyleaf-api" })
    ).toBeVisible();

    const tabs = page.getByRole("tablist", { name: "Les pages du projet" });

    await expect(tabs.getByRole("tab", { name: "Terminaux" })).toBeVisible();

    await tabs.getByRole("tab", { name: "Agents" }).click();

    const picker = page.locator("[data-agents-picker]");

    await test.step("no session opens on arrival", async () => {
      await expect(picker).toBeVisible();
      await expect(
        page.getByRole("region", { name: "Lancer un agent" })
      ).toBeVisible();
      await expect(picker.locator('[data-logo="ai.claude"]')).toBeVisible();
      await expect(
        picker.getByRole("button", { name: CLAUDE_CARD })
      ).toHaveCount(1);
      await expect(page.getByRole("tablist", { name: "Sessions" })).toHaveCount(
        0
      );

      await assertAccessible(page, "projects/agents");
    });

    await test.step("pressing Claude opens its session in the agents row", async () => {
      await picker.getByRole("button", { name: CLAUDE_CARD }).click();

      const sessions = page.getByRole("tablist", { name: "Sessions" });

      await expect(sessions.getByRole("tab", { name: "Claude" })).toBeVisible();
      await expect(picker).toHaveCount(0);
      await expect(
        tabs.getByRole("tab", { name: AGENTS_TAB }).getByText("1")
      ).toBeVisible();

      const opened = await running.app.evaluate(
        () => (globalThis as { opened?: unknown[][] }).opened ?? []
      );

      expect(opened).toHaveLength(1);
      expect(opened[0]?.[2]).toBe("claude");
      expect(opened[0]?.[3]).toBe("flyleaf-api");
    });

    await test.step("the agent that exits takes its tab with it, killing nothing", async () => {
      const id = await page
        .locator("[data-terminal-tab]")
        .first()
        .getAttribute("data-terminal-tab");

      await running.app.evaluate(({ BrowserWindow }, tab) => {
        for (const window of BrowserWindow.getAllWindows()) {
          window.webContents.send("terminal-exit", { code: 0, id: tab });
        }
      }, id);

      await expect(picker).toBeVisible();
      await expect(page.getByRole("tablist", { name: "Sessions" })).toHaveCount(
        0
      );

      const ended = await running.app.evaluate(
        () => (globalThis as { ended?: unknown[][] }).ended ?? []
      );

      expect(ended).toEqual([[id, null]]);
    });

    await test.step("closing an agent's tab asks first, then stops its session", async () => {
      await picker.getByRole("button", { name: CLAUDE_CARD }).click();

      const sessions = page.getByRole("tablist", { name: "Sessions" });

      await expect(sessions.getByRole("tab", { name: "Claude" })).toBeVisible();

      const close = page.getByRole("button", { name: CLOSE_AND_STOP });

      await close.click();

      const question = page.getByRole("alertdialog");

      await expect(question).toContainText("la conversation de l'agent");
      await page.keyboard.press("Escape");

      await expect(question).toHaveCount(0);
      await expect(sessions.getByRole("tab", { name: "Claude" })).toBeVisible();

      await close.click();
      await question
        .getByRole("button", { name: "Arrêter la session" })
        .click();

      await expect(picker).toBeVisible();

      const ended = await running.app.evaluate(
        () => (globalThis as { ended?: unknown[][] }).ended ?? []
      );

      expect(ended.at(-1)?.[1]).toMatchObject({
        session: "claude-flyleaf-api",
      });
    });
  });
});
