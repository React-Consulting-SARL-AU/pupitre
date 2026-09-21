import { expect, type Page, test } from "@playwright/test";
import { assertAccessible } from "./harness/accessible";
import { pickOption } from "./harness/controls";
import { ANSWERS, FILES } from "./harness/fixtures";
import { launchPupitre, type Running } from "./harness/launch";

/**
 * The files of a project, walked and edited from its page.
 *
 * The scenario opens the Files tab of a declared project, walks into a
 * folder, opens a text file, changes it and saves it, against a fake tree
 * the harness serves the way the agent would: a listing per folder, a stat
 * per entry, the bytes on `file` events with their receipt, and a write that
 * refuses when the digest is not the one it last gave.
 */
const FLYMATE_CARD = /^flymate-api/;
const SAVED = /^Enregistré /;
const DIGEST = /^[0-9a-f]{64}$/;

/** What the harness kept of the writes the window sent. */
interface Written {
  path: string;
  sha256?: string;
  text: string;
}

/** What the harness kept of the folders the window asked for. */
type Made = string[];

async function themed(page: Page, theme: "light" | "dark"): Promise<void> {
  await page.getByRole("button", { name: "Réglages" }).click();
  await page.getByRole("tab", { name: "Apparence" }).click();
  await pickOption(
    page,
    page.getByLabel("Thème"),
    theme === "dark" ? "Sombre" : "Clair"
  );

  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
}

async function openFiles(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Tableau de bord" }).click();
  await page.getByRole("button", { name: FLYMATE_CARD }).first().click();
  await expect(
    page.getByRole("heading", { name: "flymate-api" })
  ).toBeVisible();

  await page.getByRole("tab", { exact: true, name: "Fichiers" }).click();
  await expect(page.locator("[data-files-root]")).toBeVisible();
}

test.describe("les fichiers d'un projet", () => {
  let running: Running;

  test.beforeAll(async () => {
    running = await launchPupitre();

    await running.app.evaluate(
      (
        { ipcMain },
        fixtures: { answers: Record<string, unknown>; files: typeof FILES }
      ) => {
        const tree = structuredClone(fixtures.files);
        const kept = globalThis as {
          made?: Made;
          snapshotReads?: number;
          written?: Written[];
        };
        kept.made = [];
        kept.written = [];

        const answer = (
          channel: string,
          reply: (...args: unknown[]) => unknown
        ) => {
          ipcMain.removeHandler(channel);
          ipcMain.handle(channel, (_event, ...args: unknown[]) =>
            reply(...args)
          );
        };

        const refused = (message: string, fix: string) => ({
          error: { code: "bad_request", fix, message },
          ok: false,
        });

        const digest = async (text: string) => {
          const hash = await crypto.subtle.digest("SHA-256", Buffer.from(text));

          return Buffer.from(hash).toString("hex");
        };

        const parentOf = (path: string) =>
          path.split("/").slice(0, -1).join("/");
        const nameOf = (path: string) => path.split("/").at(-1) ?? "";

        const entryOf = (path: string) =>
          tree.folders[parentOf(path)]?.find(
            (one) => one.name === nameOf(path)
          );

        const mediaOf = (path: string) => {
          if (tree.texts[path] !== undefined) {
            return { media_type: "text/plain" };
          }

          return path.endsWith(".png") ? { media_type: "image/png" } : {};
        };

        const stat = (path: string) => {
          if (path in tree.folders) {
            return {
              ok: true,
              result: {
                kind: "dir",
                mode: "0755",
                modified_at: "2026-09-01T10:00:00Z",
                path,
                size_bytes: 4096,
              },
            };
          }

          const entry = entryOf(path);

          return entry
            ? { ok: true, result: { ...entry, path, ...mediaOf(path) } }
            : refused(
                `entrée absente : ${path}`,
                "Listez ce chemin avec fs.list."
              );
        };

        answer("completions", () => ({
          ok: true,
          result: {
            command: "dev",
            path: "",
            paths: [],
            projects: ["flymate-api"],
            root: tree.root,
            sub: [],
          },
        }));

        answer(
          "agent:call",
          async (_serverId: unknown, cmd: unknown, params: unknown) => {
            const asked = (params ?? {}) as {
              path: string;
              to?: string;
              content?: string;
              sha256?: string;
              recursive?: boolean;
            };

            if (cmd === "snapshot") {
              kept.snapshotReads = (kept.snapshotReads ?? 0) + 1;
            }

            if (cmd === "fs.list") {
              const entries = tree.folders[asked.path];

              return entries
                ? {
                    ok: true,
                    result: { entries, path: asked.path, truncated: false },
                  }
                : refused(
                    `entrée absente : ${asked.path}`,
                    "Listez ce chemin avec fs.list."
                  );
            }

            if (cmd === "fs.stat") {
              return stat(asked.path);
            }

            if (cmd === "fs.write") {
              const current = tree.texts[asked.path];
              const text = Buffer.from(asked.content ?? "", "base64").toString(
                "utf8"
              );

              if (asked.sha256 === undefined && entryOf(asked.path)) {
                return refused(
                  `entrée déjà présente : ${asked.path}`,
                  "Choisissez un autre nom."
                );
              }

              if (
                current !== undefined &&
                asked.sha256 !== (await digest(current))
              ) {
                return refused(
                  `${asked.path} a changé depuis la lecture`,
                  "Relisez le fichier avec fs.read, reportez-y vos modifications, puis réécrivez avec la nouvelle empreinte."
                );
              }

              if (current === undefined) {
                tree.folders[parentOf(asked.path)]?.push({
                  kind: "file",
                  mode: "0644",
                  modified_at: "2026-09-01T10:00:00Z",
                  name: nameOf(asked.path),
                  size_bytes: Buffer.byteLength(text),
                });
              }

              tree.texts[asked.path] = text;
              kept.written?.push({
                path: asked.path,
                sha256: asked.sha256,
                text,
              });

              return {
                ok: true,
                result: {
                  path: asked.path,
                  sha256: await digest(text),
                  size_bytes: Buffer.byteLength(text),
                },
              };
            }

            if (cmd === "fs.mkdir") {
              kept.made?.push(asked.path);
              tree.folders[asked.path] = [];
              tree.folders[parentOf(asked.path)]?.push({
                kind: "dir",
                mode: "0755",
                modified_at: "2026-09-01T10:00:00Z",
                name: nameOf(asked.path),
                size_bytes: 4096,
              });

              return { ok: true, result: { path: asked.path } };
            }

            if (cmd === "fs.rename") {
              return { ok: true, result: { path: asked.to ?? asked.path } };
            }

            if (cmd === "fs.remove") {
              return { ok: true, result: { path: asked.path, removed: 1 } };
            }

            const result = fixtures.answers[String(cmd)];

            return result === undefined
              ? refused(
                  `Le harnais n'a pas de réponse pour ${String(cmd)}.`,
                  "Ajoute-la aux fixtures de e2e/harness."
                )
              : { ok: true, result };
          }
        );

        ipcMain.removeHandler("agent:stream");
        ipcMain.handle(
          "agent:stream",
          async (
            event,
            token: unknown,
            _serverId: unknown,
            cmd: unknown,
            params: unknown
          ) => {
            const asked = params as { path: string };

            if (cmd !== "fs.read") {
              return refused(
                `Le harnais ne diffuse pas ${String(cmd)}.`,
                "Ajoute-la aux fixtures de e2e/harness."
              );
            }

            const text = tree.texts[asked.path];

            if (text === undefined) {
              return refused(
                "type de fichier non pris en charge : archive",
                "Téléchargez ce fichier : la lecture ne rend que du texte et les images de la galerie."
              );
            }

            event.sender.send("agent:event", {
              event: {
                bytes: Buffer.from(text).toString("base64"),
                event: "file",
                id: 1,
                seq: 0,
              },
              token,
            });
            event.sender.send("agent:event", { end: true, token });

            return {
              ok: true,
              result: {
                chunks: 1,
                media_type: "text/plain",
                path: asked.path,
                sha256: await digest(text),
                size_bytes: Buffer.byteLength(text),
              },
            };
          }
        );
      },
      { answers: ANSWERS as Record<string, unknown>, files: FILES }
    );
  });

  test.afterAll(async () => {
    await running.app.close();
  });

  test("ouvre, descend, modifie et enregistre un fichier", async () => {
    const { page } = running;

    await test.step("l'onglet Fichiers liste le dossier du projet, dossiers d'abord et cachés masqués", async () => {
      await openFiles(page);

      await expect(page.locator("[data-files-root]")).toHaveAttribute(
        "data-files-root",
        "projects/flymate"
      );
      await expect(page.locator('[data-entry="src"]')).toBeVisible();
      await expect(page.locator('[data-entry="README.md"]')).toBeVisible();
      await expect(page.locator('[data-entry=".env"]')).toHaveCount(0);
      await expect(page.getByText("1 entrée cachée")).toBeVisible();

      const order = await page
        .locator("[data-entry]")
        .evaluateAll((rows) =>
          rows.map((row) => row.getAttribute("data-entry"))
        );

      expect(order).toEqual(["src", "dump.tar.gz", "README.md"]);

      await assertAccessible(page, "files/list");
    });

    await test.step("un fichier que le canal ne porte pas montre sa fiche et offre de le télécharger", async () => {
      await page.locator('[data-entry="dump.tar.gz"] button').first().click();

      await expect(page.locator('[data-preview="unreadable"]')).toBeVisible();
      await expect(
        page.getByLabel("Fichier dump.tar.gz").getByText("22,9 Mo")
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Télécharger" })
      ).toBeEnabled();
    });

    await test.step("un nouveau dossier se demande en haut, dans un dialogue, et paraît dans la liste", async () => {
      await page.getByRole("button", { name: "Nouveau dossier" }).click();

      const dialog = page.getByRole("dialog", { name: "Nouveau dossier" });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByLabel("Nom")).toBeFocused();

      await assertAccessible(page, "files/new-folder");

      await dialog.getByLabel("Nom").fill("docs");
      await page.keyboard.press("Enter");

      await expect(dialog).toHaveCount(0);
      await expect(page.locator('[data-entry="docs"]')).toBeVisible();

      const made = await running.app.evaluate(
        () => (globalThis as { made?: Made }).made ?? []
      );

      expect(made).toEqual(["projects/flymate/docs"]);
    });

    await test.step("descendre dans un dossier suit le fil d'Ariane", async () => {
      await page.locator('[data-entry="src"] button').first().click();

      await expect(page.locator('[data-entry="index.ts"]')).toBeVisible();
      await expect(
        page.getByRole("button", { name: "src", exact: true })
      ).toHaveAttribute("aria-current", "location");
    });

    await test.step("un fichier texte s'ouvre dans l'éditeur, Enregistrer inactif", async () => {
      await page.locator('[data-entry="index.ts"] button').first().click();

      await expect(page.locator('[data-preview="text"]')).toBeVisible();
      await expect(page.locator(".cm-content")).toContainText(
        "export const port = 3000;"
      );
      await expect(
        page.getByRole("button", { name: "Enregistrer" })
      ).toBeDisabled();

      await assertAccessible(page, "files/editor");
    });

    await test.step("⌘F ouvre la recherche dans la langue de l'app, compte les résultats et remplace", async () => {
      await page.locator(".cm-content").click();
      await page.keyboard.press("ControlOrMeta+f");

      const panel = page.getByRole("search", { name: "Rechercher" });
      const field = panel.getByRole("textbox", { name: "Rechercher" });
      const count = panel.getByRole("status");
      await expect(field).toBeFocused();

      await field.fill("export");
      await expect(count).toHaveText("2 résultats");
      await expect(
        panel.getByRole("button", { name: "Résultat précédent" })
      ).toBeEnabled();

      await page.keyboard.press("Enter");
      await expect(count).toHaveText("1 sur 2");
      await page.keyboard.press("Enter");
      await expect(count).toHaveText("2 sur 2");

      await panel.getByRole("button", { name: "Respecter la casse" }).click();
      await field.fill("EXPORT");
      await expect(count).toHaveText("Aucun résultat");
      await expect(
        panel.getByRole("button", { name: "Tout remplacer" })
      ).toBeDisabled();
      await panel.getByRole("button", { name: "Respecter la casse" }).click();

      await field.fill("'x'");
      await panel.getByRole("textbox", { name: "Remplacer par" }).fill("'y'");
      await panel.getByRole("button", { name: "Tout remplacer" }).click();
      await expect(page.locator(".cm-content")).toContainText(
        "export const host = 'y';"
      );
      await expect(page.getByLabel("Modifié, non enregistré")).toBeVisible();

      await assertAccessible(page, "files/search");

      await panel.getByRole("button", { name: "Fermer la recherche" }).click();
      await expect(panel).toHaveCount(0);
      await expect(page.locator(".cm-content")).toBeFocused();
    });

    await test.step("modifier le tampon marque le fichier, et ⌘S l'enregistre avec l'empreinte lue", async () => {
      await page.locator(".cm-content").click();
      await page.keyboard.press("ControlOrMeta+End");
      await page.keyboard.type("export const debug = true;");

      await expect(page.getByLabel("Modifié, non enregistré")).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Enregistrer" })
      ).toBeEnabled();

      await page.keyboard.press("ControlOrMeta+s");

      await expect(page.getByText(SAVED)).toBeVisible();
      await expect(page.getByLabel("Modifié, non enregistré")).toHaveCount(0);

      const written = await running.app.evaluate(
        () => (globalThis as { written?: Written[] }).written ?? []
      );

      expect(written).toHaveLength(1);
      expect(written[0]?.path).toBe("projects/flymate/src/index.ts");
      expect(written[0]?.sha256).toMatch(DIGEST);
      expect(written[0]?.text).toContain("export const debug = true;");
      expect(written[0]?.text).toContain("export const host = 'y';");
    });

    await test.step("une seconde sauvegarde porte l'empreinte que la première a rendue", async () => {
      await page.locator(".cm-content").click();
      await page.keyboard.press("ControlOrMeta+End");
      await page.keyboard.type("\n");
      await page.getByRole("button", { name: "Enregistrer" }).click();

      await expect(
        page.getByRole("button", { name: "Enregistrer" })
      ).toBeDisabled();

      const written = await running.app.evaluate(
        () => (globalThis as { written?: Written[] }).written ?? []
      );

      expect(written).toHaveLength(2);
    });

    await test.step("un nouveau fichier se demande en haut, s'écrit vide sans empreinte et s'ouvre", async () => {
      await page.getByRole("button", { name: "Nouveau fichier" }).click();

      const dialog = page.getByRole("dialog", { name: "Nouveau fichier" });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByLabel("Nom")).toBeFocused();

      await assertAccessible(page, "files/new-file");

      await dialog.getByLabel("Nom").fill("notes.md");
      await page.keyboard.press("Enter");

      await expect(dialog).toHaveCount(0);
      await expect(page.locator('[data-entry="notes.md"]')).toBeVisible();
      await expect(page.getByLabel("Fichier notes.md")).toBeVisible();
      await expect(page.locator(".cm-content")).toHaveText("");

      const written = await running.app.evaluate(
        () => (globalThis as { written?: Written[] }).written ?? []
      );

      expect(written).toHaveLength(3);
      expect(written[2]).toEqual({
        path: "projects/flymate/src/notes.md",
        sha256: undefined,
        text: "",
      });
    });

    await test.step("un nom déjà pris est refusé sous l'en-tête, et le fichier ouvert reste", async () => {
      await page.getByRole("button", { name: "Nouveau fichier" }).click();
      await page
        .getByRole("dialog", { name: "Nouveau fichier" })
        .getByLabel("Nom")
        .fill("index.ts");
      await page.keyboard.press("Enter");

      await expect(
        page.getByText("entrée déjà présente : projects/flymate/src/index.ts")
      ).toBeVisible();
      await expect(page.getByLabel("Fichier notes.md")).toBeVisible();

      await page.getByRole("button", { name: "Masquer" }).click();
    });

    await test.step("l'écran tient la passe d'accessibilité et le texte sélectionné garde sa couleur, dans les deux thèmes", async () => {
      for (const theme of ["dark", "light"] as const) {
        await themed(page, theme);
        await openFiles(page);
        await expect(page.locator('[data-preview="text"]')).toBeVisible();

        await page.locator('[data-entry="src"] button').first().click();
        await page.locator('[data-entry="index.ts"] button').first().click();
        await expect(page.locator(".cm-content")).toContainText("export");

        const colours = await page
          .locator(".cm-line span")
          .first()
          .evaluate((token) => ({
            own: getComputedStyle(token).color,
            selected: getComputedStyle(token, "::selection").color,
          }));

        expect(colours.selected).toBe(colours.own);

        await assertAccessible(page, `files/${theme}`);
      }
    });
  });
});
