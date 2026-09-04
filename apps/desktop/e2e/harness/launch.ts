import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type ElectronApplication,
  _electron as electron,
  type Page,
} from "@playwright/test";
import { ANSWERS, SERVERS } from "./fixtures";

const ENTRY = "out/main/index.js";
const WIDTH = 1280;
const HEIGHT = 840;

export interface Running {
  app: ElectronApplication;
  page: Page;
}

interface Harness {
  answers: Record<string, unknown>;
  height: number;
  servers: unknown;
  width: number;
}

function answerFromFixtures(app: ElectronApplication): Promise<void> {
  const harness: Harness = {
    answers: ANSWERS as Record<string, unknown>,
    height: HEIGHT,
    servers: SERVERS,
    width: WIDTH,
  };

  return app.evaluate(({ BrowserWindow, ipcMain }, fixtures: Harness) => {
    const answer = (
      channel: string,
      reply: (...args: unknown[]) => unknown
    ) => {
      ipcMain.removeHandler(channel);
      ipcMain.handle(channel, (_event, ...args: unknown[]) => reply(...args));
    };

    answer("servers", () => fixtures.servers);
    answer("ssh-hosts", () => []);
    answer("completion-catalog", () => null);
    answer("server-host-key", () => ({
      ok: true,
      result: { fingerprint: "SHA256:pupitre-e2e", status: "trusted" },
    }));
    answer("agent-update:state", () => ({
      ok: true,
      result: { carried: null, installed: "0.1.0", order: "same" },
    }));
    answer("agent:call", (_serverId: unknown, cmd: unknown) => {
      const result = fixtures.answers[String(cmd)];

      if (result === undefined) {
        return {
          error: {
            code: "unknown_command",
            fix: "Ajoute-la aux fixtures de e2e/harness.",
            message: `Le harnais n'a pas de réponse pour ${String(cmd)}.`,
          },
          ok: false,
        };
      }

      return { ok: true, result };
    });

    // The content size, not the window size: a title bar of a few points would
    // put every capture at the mercy of the machine taking it.
    for (const window of BrowserWindow.getAllWindows()) {
      window.setContentSize(fixtures.width, fixtures.height);
    }
  }, harness);
}

// The real window and the real bridge; only the SSH channel is replaced, and
// the throwaway user folder keeps this machine's own configuration out of it.
export async function launchPupitre(): Promise<Running> {
  const userData = mkdtempSync(join(tmpdir(), "pupitre-e2e-"));

  const app = await electron.launch({
    args: [ENTRY, `--user-data-dir=${userData}`],
  });

  const page = await app.firstWindow();

  await answerFromFixtures(app);

  // The scenarios and the reference captures are written in French; pin the
  // language so the machine's own locale cannot change what the window says.
  await page.evaluate(() => {
    try {
      window.localStorage.setItem(
        "pupitre.navigation.v1",
        JSON.stringify({ locale: "fr" })
      );
    } catch {
      // A context without storage: the resolved system locale stands.
    }
  });

  // What the window read on the way up came from the real channels; one reload
  // puts it on the fixtures.
  await page.reload();
  await page.evaluate(() => document.fonts.ready);

  return { app, page };
}
