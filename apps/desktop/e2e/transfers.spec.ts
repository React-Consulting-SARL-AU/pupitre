import { expect, test } from "@playwright/test";
import { assertAccessible } from "./harness/accessible";
import { ANSWERS, FILES } from "./harness/fixtures";
import { launchPupitre, type Running } from "./harness/launch";

interface FakeTransfer {
  id: string;
  serverId: string;
  direction: "upload" | "download";
  kind: "file" | "dir";
  name: string;
  remotePath: string;
  localPath: string;
  tool: "rsync" | "scp";
  status: "queued" | "running" | "paused" | "done" | "failed" | "cancelled";
  done: number;
  total: number | null;
  rate: number | null;
  remaining: number | null;
  attempt: number;
  error: null;
  startedAt: number;
  endedAt: number | null;
}

interface Gestures {
  uploads: unknown[];
  downloads: unknown[];
  gestures: string[];
  listed: Record<string, number>;
}

test.describe("les transferts", () => {
  let running: Running;

  test.beforeAll(async () => {
    running = await launchPupitre();

    await running.app.evaluate(
      (
        { BrowserWindow, ipcMain },
        fixtures: { answers: Record<string, unknown>; files: typeof FILES }
      ) => {
        const files = fixtures.files;
        const kept = globalThis as Partial<Gestures>;

        kept.uploads = [];
        kept.downloads = [];
        kept.gestures = [];
        kept.listed = {};

        let revision = 0;
        let counter = 0;
        const transfers: FakeTransfer[] = [];

        const answer = (
          channel: string,
          reply: (...args: unknown[]) => unknown
        ) => {
          ipcMain.removeHandler(channel);
          ipcMain.handle(channel, (_event, ...args: unknown[]) =>
            reply(...args)
          );
        };

        const list = () => {
          revision += 1;

          return { revision, transfers: structuredClone(transfers) };
        };

        const publish = () => {
          for (const window of BrowserWindow.getAllWindows()) {
            window.webContents.send("transfer:changed", list());
          }
        };

        const fresh = (
          direction: FakeTransfer["direction"],
          remotePath: string,
          localPath: string
        ): FakeTransfer => {
          counter += 1;

          return {
            attempt: 1,
            direction,
            done: 52_428_800,
            endedAt: null,
            error: null,
            id: `t${counter}`,
            kind: "file",
            localPath,
            name: remotePath.split("/").at(-1) ?? remotePath,
            rate: 8_000_000,
            remaining: 18,
            remotePath,
            serverId: "e2e-atelier",
            startedAt: Date.now(),
            status: "running",
            tool: "rsync",
            total: 209_715_200,
          };
        };

        const move = (id: unknown, status: FakeTransfer["status"]) => {
          const transfer = transfers.find((one) => one.id === id);

          if (transfer) {
            transfer.status = status;
            transfer.rate = status === "running" ? 8_000_000 : null;
            transfer.remaining = status === "running" ? 18 : null;
          }

          kept.gestures?.push(`${status}:${String(id)}`);

          return list();
        };

        answer("completions", () => ({
          ok: true,
          result: {
            command: "dev",
            path: "",
            paths: [],
            projects: ["flyleaf-api"],
            root: files.root,
            sub: [],
          },
        }));

        answer(
          "agent:call",
          (_serverId: unknown, cmd: unknown, params: unknown) => {
            const asked = (params ?? {}) as { path: string };

            if (cmd === "fs.list") {
              const entries = files.folders[asked.path] ?? [];

              if (kept.listed) {
                kept.listed[asked.path] = (kept.listed[asked.path] ?? 0) + 1;
              }

              return {
                ok: true,
                result: { entries, path: asked.path, truncated: false },
              };
            }

            const result = fixtures.answers[String(cmd)];

            return result === undefined
              ? {
                  error: {
                    code: "unknown_command",
                    message: `Le harnais n'a pas de réponse pour ${String(cmd)}.`,
                  },
                  ok: false,
                }
              : { ok: true, result };
          }
        );

        answer("transfer:list", () => list());
        answer("transfer:pick-upload", () => ["/Users/e2e/Downloads/shop.sql"]);
        answer(
          "transfer:pick-save",
          (name: unknown) => `/Users/e2e/Downloads/${String(name)}`
        );
        answer("transfer:pick-folder", () => "/Users/e2e/Downloads");
        answer(
          "transfer:upload",
          (serverId: unknown, dir: unknown, paths: unknown) => {
            kept.uploads?.push([serverId, dir, paths]);

            for (const path of paths as string[]) {
              const name = path.split("/").at(-1) ?? path;

              transfers.push(
                fresh("upload", dir ? `${String(dir)}/${name}` : name, path)
              );
            }

            const answered = list();

            setTimeout(publish, 50);

            return { ok: true, result: answered };
          }
        );
        answer(
          "transfer:download",
          (serverId: unknown, remotePath: unknown, localPath: unknown) => {
            kept.downloads?.push([serverId, remotePath, localPath]);
            transfers.push(
              fresh("download", String(remotePath), String(localPath))
            );

            return { ok: true, result: list() };
          }
        );
        answer("transfer:pause", (id: unknown) => move(id, "paused"));
        answer("transfer:resume", (id: unknown) => move(id, "running"));
        answer("transfer:cancel", (id: unknown) => move(id, "cancelled"));
        answer("transfer:dismiss", (id: unknown) => {
          const at = transfers.findIndex((one) => one.id === id);

          if (at >= 0) {
            transfers.splice(at, 1);
          }

          return list();
        });

        (globalThis as { finish?: (id: string) => void }).finish = (id) => {
          const transfer = transfers.find((one) => one.id === id);

          if (transfer) {
            transfer.status = "done";
            transfer.done = transfer.total ?? transfer.done;
            transfer.rate = null;
            transfer.remaining = 0;
          }

          publish();
        };
      },
      { answers: ANSWERS as Record<string, unknown>, files: FILES }
    );

    await running.page.reload();
    await running.page.evaluate(() => document.fonts.ready);
  });

  test.afterAll(async () => {
    await running.app.close();
  });

  test("envoie, suit, met en pause, reprend et annule", async () => {
    const { page } = running;

    await test.step("rien ne s'affiche tant que rien ne bouge", async () => {
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.locator("[data-transfers]")).toHaveCount(0);
    });

    await test.step("Envoyer… désigne un fichier par la boîte du main et lance l'envoi dans le dossier affiché", async () => {
      await page.getByRole("button", { exact: true, name: "Fichiers" }).click();
      await expect(page.locator("[data-files-root]")).toBeVisible();
      await page.locator('[data-entry="projects"] button').first().click();
      await expect(page.locator('[data-entry="flyleaf"]')).toBeVisible();

      await page.getByRole("button", { name: "Envoyer…" }).click();

      const uploads = await running.app.evaluate(
        () => (globalThis as Partial<Gestures>).uploads ?? []
      );

      expect(uploads).toEqual([
        ["e2e-atelier", "projects", ["/Users/e2e/Downloads/shop.sql"]],
      ]);
    });

    await test.step("le volet apparaît dans la barre latérale avec la progression", async () => {
      const panel = page.getByRole("region", { name: "Transferts" });

      await expect(panel).toBeVisible();
      await expect(panel).toHaveAttribute("data-transfers-moving", "1");
      await expect(panel.getByText("1 en cours")).toBeVisible();

      const row = panel.locator('[data-transfer="t1"]');

      await expect(row).toHaveAttribute("data-status", "running");
      await expect(row.getByText("50,0 Mo sur 200,0 Mo")).toBeVisible();
      await expect(row.getByText("18 s restantes")).toBeVisible();
      await expect(row.getByRole("progressbar")).toHaveAttribute(
        "aria-valuenow",
        "25"
      );

      await assertAccessible(page, "transfers/running");
    });

    await test.step("pause puis reprise, chacune répondue sur son bouton", async () => {
      const row = page.locator('[data-transfer="t1"]');

      await row
        .getByRole("button", { name: "Mettre shop.sql en pause" })
        .click();

      await expect(row).toHaveAttribute("data-status", "paused");
      await expect(row.getByText("En pause")).toBeVisible();

      await row.getByRole("button", { name: "Reprendre shop.sql" }).click();

      await expect(row).toHaveAttribute("data-status", "running");
    });

    await test.step("le dossier affiché se relit quand l'envoi y est arrivé", async () => {
      const before = await running.app.evaluate(
        () => (globalThis as Partial<Gestures>).listed?.projects ?? 0
      );

      await running.app.evaluate(() =>
        (globalThis as { finish?: (id: string) => void }).finish?.("t1")
      );

      const row = page.locator('[data-transfer="t1"]');

      await expect(row).toHaveAttribute("data-status", "done");
      await expect(row.getByText("Terminé")).toBeVisible();
      await expect
        .poll(() =>
          running.app.evaluate(
            () => (globalThis as Partial<Gestures>).listed?.projects ?? 0
          )
        )
        .toBe(before + 1);

      await row
        .getByRole("button", { name: "Retirer shop.sql de la liste" })
        .click();

      await expect(page.locator('[data-transfer="t1"]')).toHaveCount(0);
    });

    await test.step("Télécharger, depuis le menu d'une entrée, demande où enregistrer", async () => {
      await page.getByRole("button", { name: "Actions sur flyleaf" }).click();
      await page
        .getByRole("menuitem", { name: "Télécharger sur cet ordinateur" })
        .click();

      const downloads = await running.app.evaluate(
        () => (globalThis as Partial<Gestures>).downloads ?? []
      );

      expect(downloads).toEqual([
        ["e2e-atelier", "projects/flyleaf", "/Users/e2e/Downloads"],
      ]);

      const row = page.locator('[data-transfer="t2"]');

      await expect(row).toHaveAttribute("data-direction", "download");
    });

    await test.step("annuler retire le transfert de ce qui bouge", async () => {
      const row = page.locator('[data-transfer="t2"]');

      await row.getByRole("button", { name: "Annuler flyleaf" }).click();

      await expect(row).toHaveAttribute("data-status", "cancelled");
      await expect(
        page.getByRole("region", { name: "Transferts" })
      ).toHaveAttribute("data-transfers-moving", "0");

      const gestures = await running.app.evaluate(
        () => (globalThis as Partial<Gestures>).gestures ?? []
      );

      expect(gestures).toEqual(["paused:t1", "running:t1", "cancelled:t2"]);

      await assertAccessible(page, "transfers/settled");
    });

    await test.step("le volet se replie et garde son compte", async () => {
      const panel = page.getByRole("region", { name: "Transferts" });

      await panel
        .getByRole("button", { name: "Afficher ou masquer les transferts" })
        .click();

      await expect(page.locator('[data-transfer="t2"]')).toHaveCount(0);
      await expect(
        panel.getByRole("button", {
          name: "Afficher ou masquer les transferts",
        })
      ).toHaveAttribute("aria-expanded", "false");
    });

    await test.step("aucune fenêtre ni boîte de dialogue n'a été montrée", async () => {
      const visible = await running.app.evaluate(
        ({ BrowserWindow }) =>
          BrowserWindow.getAllWindows().filter((window) => window.isVisible())
            .length
      );

      expect(visible).toBe(0);
    });
  });
});
