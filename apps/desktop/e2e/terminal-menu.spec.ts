import { expect, test } from "@playwright/test";
import { launchPupitre, type Running } from "./harness/launch";

const FLYLEAF_CARD = /^flyleaf-api/;
const ESC = "\x1b";
const MOUSE_ON = `${ESC}[?1000h${ESC}[?1006h`;
const MOUSE_OFF = `${ESC}[?1006l${ESC}[?1000l`;
const PRINTED = "menu-test-output";
const RIGHT_CLICK_REPORTED = /\^\[\[<2;/;

test.describe("the right click in a session", () => {
  let running: Running;

  test.beforeAll(async () => {
    running = await launchPupitre();

    await running.app.evaluate(({ ipcMain }) => {
      const kept = globalThis as { written?: string[] };

      kept.written = [];
      ipcMain.removeHandler("terminal-open");
      ipcMain.handle("terminal-open", () => ({
        ok: true,
        result: { session: "flyleaf-api" },
      }));
      ipcMain.on("terminal-write", (_event, _id: unknown, data: unknown) => {
        if (typeof data === "string") {
          kept.written?.push(data);
        }
      });
    });
  });

  test.afterAll(async () => {
    await running.app.close();
  });

  async function push(id: string, data: string): Promise<void> {
    await running.app.evaluate(
      ({ BrowserWindow }, payload) => {
        for (const window of BrowserWindow.getAllWindows()) {
          window.webContents.send("terminal-data", payload);
        }
      },
      { data, id }
    );
  }

  async function written(): Promise<string> {
    const chunks = await running.app.evaluate(
      () => (globalThis as { written?: string[] }).written ?? []
    );

    return chunks.join("").replaceAll(ESC, "^[");
  }

  test("offers the terminal's actions, and leaves the mouse to a program that asked for it", async () => {
    const { app, page } = running;

    await page.getByRole("button", { name: FLYLEAF_CARD }).first().click();
    await app.evaluate(({ BrowserWindow }) => {
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send("menu:command", "new-terminal");
      }
    });

    const terminal = page.locator("[data-terminal]").first();
    const id = (await terminal.getAttribute("data-terminal")) as string;
    const screen = terminal.locator(".xterm-screen");
    const menu = page.locator(`[data-terminal-menu="${id}"]`);

    await expect(screen).toBeVisible();
    await push(id, `$ echo ${PRINTED}\r\n${PRINTED}\r\n$ `);

    await test.step("copy waits for a selection", async () => {
      await screen.click({ button: "right", position: { x: 400, y: 200 } });

      await expect(menu).toBeVisible();
      await expect(menu.locator('[data-action="copy"]')).toHaveAttribute(
        "data-disabled",
        ""
      );

      await menu.locator('[data-action="selectAll"]').click();
      await expect(menu).toBeHidden();

      await screen.click({ button: "right", position: { x: 400, y: 200 } });
      await expect(menu.locator('[data-action="copy"]')).not.toHaveAttribute(
        "data-disabled"
      );

      const held = await app.evaluate(({ clipboard }) => clipboard.readText());

      try {
        await menu.locator('[data-action="copy"]').click();
        await expect
          .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
          .toContain(PRINTED);
      } finally {
        await app.evaluate(({ clipboard }, text) => {
          clipboard.writeText(text);
        }, held);
      }
    });

    await test.step("search opens the session's search bar", async () => {
      await screen.click({ button: "right", position: { x: 400, y: 200 } });
      await menu.locator('[data-action="search"]').click();

      await expect(page.locator(`[data-search="${id}"] input`)).toBeFocused();
      await page.keyboard.press("Escape");
    });

    await test.step("a program that tracks the mouse gets the right click", async () => {
      await push(id, MOUSE_ON);
      await screen.click({ button: "right", position: { x: 400, y: 200 } });

      await expect(menu).toBeHidden();
      await expect.poll(written).toMatch(RIGHT_CLICK_REPORTED);

      await push(id, MOUSE_OFF);
    });
  });
});
