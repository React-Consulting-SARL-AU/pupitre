import { expect, test } from "@playwright/test";
import { launchPupitre, type Running } from "./harness/launch";

const FLYLEAF_CARD = /^flyleaf-api/;
const LATEST_COMMAND = /echo commit/;
const PROMPT = "\x1b]7;file://atelier/home/dev\x07$ \x1b]133;B\x07";

test.describe("completion in a shell tab", () => {
  let running: Running;

  test.beforeAll(async () => {
    running = await launchPupitre();

    // A line editor reduced to echo, erase and a fresh prompt per line.
    await running.app.evaluate(({ BrowserWindow, ipcMain }, prompt) => {
      const echoOf = (data: string): string => {
        if (data === "\x7f") {
          return "\b\x1b[K";
        }

        if (data === "\r") {
          return `\r\n\x1b]133;C\x07\x1b]133;D;0\x07${prompt}`;
        }

        return data;
      };

      ipcMain.removeHandler("terminal-open");
      ipcMain.handle("terminal-open", () => ({
        ok: true,
        result: { session: "flyleaf-api" },
      }));
      ipcMain.on("terminal-write", (_event, id: unknown, data: unknown) => {
        if (typeof id !== "string" || typeof data !== "string") {
          return;
        }

        for (const window of BrowserWindow.getAllWindows()) {
          window.webContents.send("terminal-data", {
            data: echoOf(data),
            id,
          });
        }
      });
    }, PROMPT);
  });

  test.afterAll(async () => {
    await running.app.close();
  });

  test("chooses nothing for the reader, and never draws back what was erased", async () => {
    const { app, page } = running;

    await page.getByRole("button", { name: FLYLEAF_CARD }).first().click();
    await app.evaluate(({ BrowserWindow }) => {
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send("menu:command", "new-terminal");
      }
    });

    const terminal = page.locator("[data-terminal]").first();
    const id = await terminal.getAttribute("data-terminal");

    await expect(terminal.locator(".xterm-screen")).toBeVisible();
    await app.evaluate(
      ({ BrowserWindow }, payload) => {
        for (const window of BrowserWindow.getAllWindows()) {
          window.webContents.send("terminal-data", payload);
        }
      },
      { data: PROMPT, id }
    );
    await terminal.locator(".xterm-screen").click();

    for (const line of ["echo status", "echo commit"]) {
      await page.keyboard.type(line);
      await page.keyboard.press("Enter");
    }

    await page.keyboard.type("echo");

    const list = page.getByRole("listbox");
    const ghost = page.locator("[data-completion-ghost]");

    await expect(list).toBeVisible();
    await expect(ghost).toHaveText(" commit");
    await expect(
      list.locator('[role="option"][aria-selected="true"]')
    ).toHaveCount(0);

    await page.keyboard.press("Backspace");

    await expect(list).toBeHidden();
    await expect(ghost).toBeHidden();

    await page.keyboard.type("o");
    await expect(list).toBeVisible();

    await page.keyboard.press("ArrowDown");
    await expect(
      list.locator('[role="option"][aria-selected="true"]')
    ).toHaveText(LATEST_COMMAND);
  });
});
