import { expect, test } from "@playwright/test";
import { assertAccessible } from "./harness/accessible";
import { launchPupitre, type Running } from "./harness/launch";

/**
 * The agents tab of a project.
 *
 * Nothing starts on arrival: the tab offers one card per agent the snapshot's
 * modules hold — `ai.claude` in the fixtures — and the shells stay on their
 * own tab. Pressing a card opens the session; `terminal-open` is answered here
 * rather than by a real `ssh`, and the exit of the agent is pushed the way the
 * main process pushes it, so the tab is seen closing itself.
 */
const FLYMATE_CARD = /^flymate-api/;
const CLAUDE_CARD = /Claude/;
const AGENTS_TAB = /^Agents/;

test.describe("l'onglet Agents d'un projet", () => {
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

        return { ok: true, result: { session: "claude-flymate-api" } };
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

  test("propose les agents de la machine, lance celui qu'on presse, et ferme son onglet quand il quitte", async () => {
    const { page } = running;

    await page.getByRole("button", { name: FLYMATE_CARD }).first().click();

    await expect(
      page.getByRole("heading", { name: "flymate-api" })
    ).toBeVisible();

    const tabs = page.getByRole("tablist", { name: "Les pages du projet" });

    await expect(tabs.getByRole("tab", { name: "Terminaux" })).toBeVisible();

    await tabs.getByRole("tab", { name: "Agents" }).click();

    const picker = page.locator("[data-agents-picker]");

    await test.step("aucune session ne s'ouvre à l'arrivée", async () => {
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

    await test.step("presser Claude ouvre sa session dans la rangée des agents", async () => {
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
      expect(opened[0]?.[3]).toBe("flymate-api");
    });

    await test.step("l'agent qui quitte emporte son onglet, sans rien tuer", async () => {
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
  });
});
