import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type ElectronApplication,
  _electron as electron,
  type Page,
} from "@playwright/test";
import { ACCOUNT, ANSWERS, SERVERS } from "./fixtures";

const ENTRY = "out/main/index.cjs";
const WIDTH = 1280;
const HEIGHT = 840;

export interface Running {
  app: ElectronApplication;
  page: Page;
}

interface Harness {
  account: unknown;
  answers: Record<string, unknown>;
  height: number;
  servers: unknown;
  width: number;
}

function answerFromFixtures(app: ElectronApplication): Promise<void> {
  const harness: Harness = {
    account: ACCOUNT,
    answers: ANSWERS as Record<string, unknown>,
    height: HEIGHT,
    servers: SERVERS,
    width: WIDTH,
  };

  return app.evaluate(({ BrowserWindow, ipcMain }, fixtures: Harness) => {
    // Snapshot reads are counted so a scenario waits on polls, not on a guessed clock.
    const counted = globalThis as {
      snapshotReads?: number;
      answers?: Record<string, unknown>;
    };

    counted.answers = fixtures.answers;
    counted.snapshotReads = 0;

    const answer = (
      channel: string,
      reply: (...args: unknown[]) => unknown
    ) => {
      ipcMain.removeHandler(channel);
      ipcMain.handle(channel, (_event, ...args: unknown[]) => reply(...args));
    };

    answer("account:state", () => fixtures.account);
    answer("account:refresh", () => fixtures.account);
    answer("servers", () => fixtures.servers);
    answer("ssh-hosts", () => []);
    answer("dev:defaults", () => null);
    answer("fleet:list", () => ({
      ok: true,
      result: {
        adopted: [],
        changed: false,
        config: fixtures.servers,
        granted: [],
        withdrawn: [],
      },
    }));
    answer("completions", () => ({
      ok: false,
      error: { code: "internal", message: "no agent in this test" },
    }));
    answer("server-host-key", () => ({
      ok: true,
      result: { fingerprint: "SHA256:pupitre-e2e", status: "trusted" },
    }));
    answer("agent-update:state", () => ({
      ok: true,
      result: {
        carried: null,
        config: null,
        installed: "0.1.0",
        order: "same",
      },
    }));

    // A native file picker would be the one window the suite must never show.
    answer("transfer:list", () => ({ revision: 0, transfers: [] }));
    answer("transfer:pick-upload", () => []);
    answer("transfer:pick-save", () => null);
    answer("transfer:pick-folder", () => null);

    const saves = globalThis as {
      savedShots?: { path: unknown; bytes: number }[];
    };

    saves.savedShots = [];
    answer("shots:save", (path: unknown, bytes: unknown) => {
      saves.savedShots?.push({
        bytes: bytes instanceof Uint8Array ? bytes.byteLength : -1,
        path,
      });

      return { ok: true, result: { path } };
    });

    answer("service:forwards", () => []);
    answer("service:db-shell", () => ({
      ok: true,
      result: { id: "db-e2e", session: "db-postgres-1" },
    }));

    ipcMain.removeHandler("service:logs");
    ipcMain.handle("service:logs", async (event, token: unknown) => {
      for (const line of [
        "2026-09-11 10:00:01 UTC [1] LOG:  database system is ready to accept connections",
        "2026-09-11 10:00:02 UTC [42] LOG:  checkpoint starting: time",
        "2026-09-11 10:00:03 UTC [42] LOG:  checkpoint complete",
      ]) {
        event.sender.send("service:log-line", { line, token });
      }

      // An answer sent on the heels of its events overtakes them, and the page stops listening.
      await new Promise((resolve) => setTimeout(resolve, 300));

      return { ok: true, result: { lines: [] } };
    });

    answer("agent:call", (_serverId: unknown, cmd: unknown) => {
      if (cmd === "snapshot") {
        counted.snapshotReads = (counted.snapshotReads ?? 0) + 1;
      }

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

    // Content size, not window size: the title bar height varies with the machine.
    for (const window of BrowserWindow.getAllWindows()) {
      window.setContentSize(fixtures.width, fixtures.height);
    }
  }, harness);
}

export function savedShots(
  app: ElectronApplication
): Promise<{ path: unknown; bytes: number }[]> {
  return app.evaluate(
    () =>
      (globalThis as { savedShots?: { path: unknown; bytes: number }[] })
        .savedShots ?? []
  );
}

export function snapshotReads(app: ElectronApplication): Promise<number> {
  return app.evaluate(
    () => (globalThis as { snapshotReads?: number }).snapshotReads ?? 0
  );
}

export async function launchPupitre(): Promise<Running> {
  // A throwaway user folder keeps this machine's own configuration out.
  const userData = mkdtempSync(join(tmpdir(), "pupitre-e2e-"));

  const app = await electron.launch({
    args: [ENTRY, `--user-data-dir=${userData}`],
    // Keeps the app off the Dock and unfocused; the window is still drawn for captures.
    env: { ...process.env, PUPITRE_E2E: "1" },
  });

  const page = await app.firstWindow();

  await answerFromFixtures(app);

  // Pinned to French so the machine's locale cannot change what the window says.
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

  // The first load read the real channels; reload onto the fixtures.
  await page.reload();
  await page.evaluate(() => document.fonts.ready);

  return { app, page };
}
