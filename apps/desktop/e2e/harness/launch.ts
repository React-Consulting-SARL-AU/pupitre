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
    // Every snapshot read is counted, so a scenario waits on the polls it
    // needs rather than on a clock that guesses at them.
    const counted = globalThis as { snapshotReads?: number };
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
    // No transfer moves under the harness, and no native dialog opens: a
    // file picker dropped over the screen would be the one window the suite
    // is not allowed to show.
    answer("transfer:list", () => ({ revision: 0, transfers: [] }));
    answer("transfer:pick-upload", () => []);
    answer("transfer:pick-save", () => null);
    answer("transfer:pick-folder", () => null);
    // A capture saved on the disk goes through the same dialog; here the
    // write is recorded rather than made, so a scenario reads what would have
    // landed, and where.
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
    // A followed journal and a database shell would open the agent's channel:
    // the journal answers three lines and closes, the shell names a tab. The
    // answer waits a beat, as a real follow does: an answer sent on the heels
    // of its events overtakes them, and the page stops listening on it.
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

    // The content size, not the window size: a title bar of a few points would
    // put every capture at the mercy of the machine taking it.
    for (const window of BrowserWindow.getAllWindows()) {
      window.setContentSize(fixtures.width, fixtures.height);
    }
  }, harness);
}

/** What the window asked the harness to write on the disk, in order. */
export function savedShots(
  app: ElectronApplication
): Promise<{ path: unknown; bytes: number }[]> {
  return app.evaluate(
    () =>
      (globalThis as { savedShots?: { path: unknown; bytes: number }[] })
        .savedShots ?? []
  );
}

/** How many times the window has asked the harness for `snapshot`. */
export function snapshotReads(app: ElectronApplication): Promise<number> {
  return app.evaluate(
    () => (globalThis as { snapshotReads?: number }).snapshotReads ?? 0
  );
}

// The real window and the real bridge; only the SSH channel is replaced, and
// the throwaway user folder keeps this machine's own configuration out of it.
export async function launchPupitre(): Promise<Running> {
  const userData = mkdtempSync(join(tmpdir(), "pupitre-e2e-"));

  const app = await electron.launch({
    args: [ENTRY, `--user-data-dir=${userData}`],
    // The app stays out of the way: no Dock icon, never the active application,
    // and a window shown without being focused. It is still drawn, so the
    // captures do not change.
    env: { ...process.env, PUPITRE_E2E: "1" },
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
