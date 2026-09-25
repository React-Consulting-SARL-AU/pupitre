import { expect, test } from "@playwright/test";
import { launchPupitre, type Running } from "./harness/launch";

/**
 * The mouse in a session.
 *
 * tmux asks for the mouse on every session, and the agents under it do too:
 * a press must reach them, otherwise no pane can be picked and nothing in
 * Claude Code answers a click. Option on macOS, Shift elsewhere, keeps a drag
 * for the terminal's own selection. And what tmux copies, announced with
 * OSC 52, must land in the clipboard here. `terminal-open` is answered by the
 * harness; what the terminal would send the PTY is caught on `terminal-write`.
 */
const FLYLEAF_CARD = /^flyleaf-api/;
const SELECT_MODIFIER = process.platform === "darwin" ? "Alt" : "Shift";
const ESC = "\x1b";
const MOUSE_ON = `${ESC}[?1000h${ESC}[?1006h`;
const COPIED_BY_TMUX = "copié dans tmux";
/** An SGR press then its release, ESC written `^[` the way a terminal shows it. */
const CLICK_REPORTED = /\^\[\[<0;\d+;\d+M\^\[\[<0;\d+;\d+m/;
const ANY_REPORT = /\^\[\[</;

test.describe("la souris dans une session", () => {
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
      { id, data }
    );
  }

  async function written(): Promise<string> {
    const chunks = await running.app.evaluate(
      () => (globalThis as { written?: string[] }).written ?? []
    );

    return chunks.join("").replaceAll(ESC, "^[");
  }

  test("un clic part au programme, une touche le garde pour la sélection, une copie de tmux arrive", async () => {
    const { page } = running;

    await page.getByRole("button", { name: FLYLEAF_CARD }).first().click();
    await expect(
      page.getByRole("heading", { name: "flyleaf-api" })
    ).toBeVisible();
    await running.app.evaluate(({ BrowserWindow }) => {
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send("menu:command", "new-terminal");
      }
    });

    const terminal = page.locator("[data-terminal]").first();
    const id = await terminal.getAttribute("data-terminal");
    const screen = terminal.locator(".xterm-screen");

    expect(id).not.toBeNull();
    await expect(screen).toBeVisible();

    await push(id as string, `${MOUSE_ON}$ `);

    const box = await screen.boundingBox();

    expect(box).not.toBeNull();

    const x = (box as { x: number }).x + 40;
    const y = (box as { y: number }).y + 12;

    await test.step("un clic est rapporté au programme qui a demandé la souris", async () => {
      await page.mouse.click(x, y);

      await expect.poll(written).toMatch(CLICK_REPORTED);
    });

    await test.step("avec la touche de sélection, le glisser reste au terminal", async () => {
      const before = (await written()).length;

      await page.keyboard.down(SELECT_MODIFIER);
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + 30, y, { steps: 4 });
      await page.mouse.up();
      await page.keyboard.up(SELECT_MODIFIER);

      const after = await written();

      expect(after.slice(before)).not.toMatch(ANY_REPORT);
    });

    await test.step("ce que tmux copie arrive dans le presse-papiers", async () => {
      const encoded = Buffer.from(COPIED_BY_TMUX, "utf8").toString("base64");
      const held = await running.app.evaluate(({ clipboard }) =>
        clipboard.readText()
      );

      try {
        await push(id as string, `${ESC}]52;c;${encoded}\x07`);

        await expect
          .poll(() =>
            running.app.evaluate(({ clipboard }) => clipboard.readText())
          )
          .toBe(COPIED_BY_TMUX);
      } finally {
        await running.app.evaluate(({ clipboard }, text) => {
          clipboard.writeText(text);
        }, held);
      }
    });
  });
});
