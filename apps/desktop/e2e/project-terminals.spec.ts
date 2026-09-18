import { expect, test } from "@playwright/test";
import { assertAccessible } from "./harness/accessible";
import { launchPupitre, type Running } from "./harness/launch";

/**
 * The keyboard on a project's page.
 *
 * ⌘T on a project must give a shell in that project, on its terminals tab —
 * not a terminal on the server, which is what it gave before; ⌘⇧T an agent
 * session on its agents tab; ⌘⌥ with an arrow or a digit walks the tabs, from
 * inside a session as from the page. Every chord is written on the control it
 * presses, and ⌘/ lists them all. The menu commands are pushed the way the
 * main process pushes them; `terminal-open` is answered here rather than by a
 * real `ssh`.
 */
const FLYMATE_CARD = /^flymate-api/;
const TERMINALS_TAB = /^Terminaux/;
const AGENTS_TAB = /^Agents/;
const PROJECT_CHORD =
  process.platform === "darwin" ? "Meta+Alt" : "Control+Alt";

test.describe("le clavier sur la page d'un projet", () => {
  let running: Running;

  test.beforeAll(async () => {
    running = await launchPupitre();

    await running.app.evaluate(({ ipcMain }) => {
      const kept = globalThis as { opened?: unknown[] };

      kept.opened = [];
      ipcMain.removeHandler("terminal-open");
      ipcMain.handle("terminal-open", (_event, ...args: unknown[]) => {
        kept.opened?.push(args);

        return { ok: true, result: { session: "flymate-api" } };
      });
    });
  });

  test.afterAll(async () => {
    await running.app.close();
  });

  async function menu(command: string): Promise<void> {
    await running.app.evaluate(({ BrowserWindow }, name) => {
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send("menu:command", name);
      }
    }, command);
  }

  async function opened(): Promise<unknown[][]> {
    return await running.app.evaluate(
      () => (globalThis as { opened?: unknown[][] }).opened ?? []
    );
  }

  test("ouvre les sessions dans le projet affiché et marche dans ses onglets", async () => {
    const { page } = running;

    await page.getByRole("button", { name: FLYMATE_CARD }).first().click();

    const heading = page.getByRole("heading", { name: "flymate-api" });
    const tabs = page.getByRole("tablist", { name: "Les pages du projet" });
    const selected = (name: RegExp | string) =>
      expect(tabs.getByRole("tab", { name })).toHaveAttribute(
        "aria-selected",
        "true"
      );

    await expect(heading).toBeVisible();
    await selected("Vue d'ensemble");

    await test.step("⌘T ouvre un shell du projet, sur son onglet des terminaux", async () => {
      await menu("new-terminal");

      await expect(heading).toBeVisible();
      await selected(TERMINALS_TAB);
      await expect(
        page.getByRole("tablist", { name: "Sessions" }).getByRole("tab", {
          name: "Terminal",
        })
      ).toBeVisible();

      const calls = await opened();

      expect(calls).toHaveLength(1);
      expect(calls[0]?.[2]).toBe("shell");
      expect(calls[0]?.[3]).toBe("flymate-api");
    });

    await test.step("⌘⇧T ouvre le premier agent de la machine, sur l'onglet des agents", async () => {
      await menu("new-agent");

      await selected(AGENTS_TAB);
      await expect(
        page.getByRole("tablist", { name: "Sessions" }).getByRole("tab", {
          name: "Claude",
        })
      ).toBeVisible();

      const calls = await opened();

      expect(calls).toHaveLength(2);
      expect(calls[1]?.[2]).toBe("claude");
      expect(calls[1]?.[3]).toBe("flymate-api");
    });

    await test.step("⌘⌥← et ⌘⌥→ passent à l'onglet voisin, ⌘⌥1 saute au premier", async () => {
      await page.keyboard.press(`${PROJECT_CHORD}+ArrowLeft`);
      await selected(TERMINALS_TAB);

      await page.keyboard.press(`${PROJECT_CHORD}+ArrowRight`);
      await selected(AGENTS_TAB);

      await page.keyboard.press(`${PROJECT_CHORD}+ArrowRight`);
      await selected("Vue d'ensemble");

      await page.keyboard.press(`${PROJECT_CHORD}+Digit3`);
      await selected("Journal");

      await page.keyboard.press(`${PROJECT_CHORD}+Digit1`);
      await selected("Vue d'ensemble");
    });

    await test.step("chaque onglet dit le raccourci qui y mène", async () => {
      const chord = process.platform === "darwin" ? "⌘⌥" : "Ctrl+Alt+";

      await expect(
        tabs.getByRole("tab", { name: TERMINALS_TAB })
      ).toHaveAttribute("data-tooltip", `${chord}6`);
    });

    await test.step("⌘/ ouvre la fiche des raccourcis, échap la ferme", async () => {
      await page.keyboard.press(`${PROJECT_CHORD}+Digit3`);
      await selected("Journal");
      await menu("shortcuts");

      const sheet = page.getByRole("dialog", { name: "Raccourcis clavier" });

      await expect(sheet).toBeVisible();
      await expect(
        sheet.getByText("Nouveau terminal dans le projet affiché")
      ).toBeVisible();

      await assertAccessible(page, "shell/shortcuts");

      await page.keyboard.press("Escape");

      await expect(sheet).toHaveCount(0);
    });
  });
});
