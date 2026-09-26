import { expect, test } from "@playwright/test";
import { assertAccessible } from "./harness/accessible";
import { ANSWERS } from "./harness/fixtures";
import { launchPupitre, type Running, savedShots } from "./harness/launch";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

const SHOTS = [
  {
    created_at: "2026-09-05T10:00:00Z",
    name: "panier.png",
    path: "boutique/2026-09-05/panier.png",
    project: "boutique",
    size_bytes: PNG.length,
  },
  {
    created_at: "2026-09-05T11:00:00Z",
    name: "paiement.png",
    path: "boutique/2026-09-05/paiement.png",
    project: "boutique",
    size_bytes: PNG.length,
  },
  {
    created_at: "2026-09-04T10:00:00Z",
    name: "accueil.png",
    path: "_unfiled/2026-09-04/accueil.png",
    project: null,
    size_bytes: PNG.length,
  },
];

const GALLERY = { exposed: true, url: "https://shots.flyleaf.dev/jeton" };

test.describe("la galerie", () => {
  let running: Running;

  test.beforeAll(async () => {
    running = await launchPupitre();

    await running.app.evaluate(
      (
        { ipcMain },
        fixtures: {
          answers: Record<string, unknown>;
          gallery: typeof GALLERY;
          png: string;
          shots: typeof SHOTS;
        }
      ) => {
        const kept = globalThis as {
          snapshotReads?: number;
          cleaned?: unknown[];
        };

        kept.cleaned = [];

        let shots = [...fixtures.shots];

        const answer = (
          channel: string,
          reply: (...args: unknown[]) => unknown
        ) => {
          ipcMain.removeHandler(channel);
          ipcMain.handle(channel, (_event, ...args: unknown[]) =>
            reply(...args)
          );
        };

        answer(
          "agent:call",
          (_serverId: unknown, cmd: unknown, params: unknown) => {
            if (cmd === "snapshot") {
              kept.snapshotReads = (kept.snapshotReads ?? 0) + 1;
            }

            if (cmd === "shots.list") {
              return { ok: true, result: { shots } };
            }

            if (cmd === "shots.url") {
              return { ok: true, result: fixtures.gallery };
            }

            if (cmd === "shots.clean") {
              const asked = (params ?? {}) as { path?: string };

              kept.cleaned?.push(asked);

              if (asked.path) {
                const before = shots.length;

                shots = shots.filter((shot) => shot.path !== asked.path);

                return { ok: true, result: { removed: before - shots.length } };
              }

              const removed = shots.length;

              shots = [];

              return { ok: true, result: { removed } };
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

            if (cmd !== "shots.read") {
              return {
                error: {
                  code: "unknown_command",
                  message: `Le harnais ne diffuse pas ${String(cmd)}.`,
                },
                ok: false,
              };
            }

            const bytes = Buffer.from(fixtures.png, "base64");
            const hash = await crypto.subtle.digest("SHA-256", bytes);

            event.sender.send("agent:event", {
              event: { bytes: fixtures.png, event: "shot", id: 1, seq: 0 },
              token,
            });
            event.sender.send("agent:event", { end: true, token });

            return {
              ok: true,
              result: {
                chunks: 1,
                media_type: "image/png",
                path: asked.path,
                sha256: Buffer.from(hash).toString("hex"),
                size_bytes: bytes.length,
              },
            };
          }
        );
      },
      {
        answers: ANSWERS,
        gallery: GALLERY,
        png: PNG.toString("base64"),
        shots: SHOTS,
      }
    );
  });

  test.afterAll(async () => {
    await running.app.close();
  });

  test("dessine les captures par jour et en supprime une par son bouton", async () => {
    const { page } = running;

    await page.getByRole("button", { name: "Galerie" }).click();

    await test.step("la grille groupe par jour, dans l'ordre de la liste", async () => {
      await expect(page.locator("[data-shot-day]")).toHaveCount(2);
      await expect(page.locator("[data-shot-day]").first()).toHaveAttribute(
        "data-shot-day",
        "2026-09-05"
      );
      await expect(page.locator("[data-shot]")).toHaveCount(3);
    });

    await test.step("les vignettes reçoivent leurs octets par le canal, et la page les dessine", async () => {
      const thumbnail = page.locator(
        '[data-shot="boutique/2026-09-05/panier.png"] img'
      );

      await expect(thumbnail).toBeVisible();
      await expect
        .poll(() =>
          thumbnail.evaluate((img: HTMLImageElement) => img.naturalWidth)
        )
        .toBeGreaterThan(0);
    });

    await test.step("les onglets rangent les captures par projet, sans projet en dernier", async () => {
      const folders = page.getByRole("tab");

      await expect(folders).toHaveText([
        "Toutes3",
        "boutique2",
        "Sans projet1",
      ]);

      await page.getByRole("tab", { name: "boutique 2" }).click();
      await expect(page.locator("[data-shot]")).toHaveCount(2);

      await page.getByRole("tab", { name: "Sans projet 1" }).click();
      await expect(page.locator("[data-shot]")).toHaveCount(1);

      await page.getByRole("tab", { name: "Toutes 3" }).click();
      await expect(page.locator("[data-shot]")).toHaveCount(3);
      await expect(
        page.locator('[data-shot="_unfiled/2026-09-04/accueil.png"]')
      ).toContainText("Sans projet ·");
    });

    await test.step("une galerie publiée s'ouvre dans le navigateur", async () => {
      await expect(
        page.getByRole("button", { name: "Ouvrir la galerie" })
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Publier la galerie" })
      ).toHaveCount(0);
    });

    await test.step("l'écran tient l'accessibilité", async () => {
      await assertAccessible(page, "shots/grid");
    });

    await test.step("une capture se supprime par son propre bouton, en deux gestes", async () => {
      const tile = page.locator(
        '[data-shot="boutique/2026-09-05/paiement.png"]'
      );

      await tile.getByRole("button", { name: "Supprimer" }).click();

      const question = page.getByRole("alertdialog");

      await expect(
        question.getByText("paiement.png sera supprimée")
      ).toBeVisible();
      await question.getByRole("button", { name: "Supprimer" }).click();

      await expect(page.locator("[data-shot]")).toHaveCount(2);
      await expect(
        page.locator('[data-shot="boutique/2026-09-05/paiement.png"]')
      ).toHaveCount(0);
      await expect(page.getByText("1 supprimée")).toBeVisible();

      const cleaned = await running.app.evaluate(
        () => (globalThis as { cleaned?: unknown[] }).cleaned ?? []
      );

      expect(cleaned).toEqual([{ path: "boutique/2026-09-05/paiement.png" }]);
    });

    await test.step("la visionneuse s'ouvre par-dessus et se ferme à Échap", async () => {
      await page
        .getByRole("button", { exact: true, name: "Voir panier.png" })
        .click();

      const viewer = page.locator("[data-shot-viewer]");

      await expect(viewer).toBeVisible();
      await expect(viewer.getByText("boutique · 1 / 2")).toBeVisible();

      await page.keyboard.press("ArrowRight");
      await expect(viewer.getByText("Sans projet · 2 / 2")).toBeVisible();

      await page.keyboard.press("Escape");
      await expect(page.locator("[data-shot-viewer]")).toHaveCount(0);
    });

    await test.step("la visionneuse dit tout de la capture et donne son adresse publique", async () => {
      await page
        .getByRole("button", { exact: true, name: "Voir accueil.png" })
        .click();

      const details = page.locator("[data-shot-details]");

      await expect(details.getByText("Sans projet")).toBeVisible();
      await expect(
        details.getByText("~/shots/_unfiled/2026-09-04/accueil.png")
      ).toBeVisible();
      await expect(
        details.getByText(
          "https://shots.flyleaf.dev/jeton/_unfiled/2026-09-04/accueil.png"
        )
      ).toBeVisible();
      await expect(details.getByText("1 × 1 ·")).toBeVisible();

      await expect(page.locator("[data-shot-strip]")).toHaveCount(2);
      await expect(
        page.locator('[data-shot-strip="_unfiled/2026-09-04/accueil.png"]')
      ).toHaveAttribute("aria-current", "true");

      await assertAccessible(page, "shots/viewer");
    });

    await test.step("la taille réelle se prend et se quitte", async () => {
      const stage = page.locator("[data-shot-zoom]");

      await expect(stage).toHaveAttribute("data-shot-zoom", "fit");

      await page.locator('[data-tooltip="Taille réelle"]').click();
      await expect(stage).toHaveAttribute("data-shot-zoom", "actual");

      await page.locator('[data-tooltip="Ajuster à la fenêtre"]').click();
      await expect(stage).toHaveAttribute("data-shot-zoom", "fit");
    });

    await test.step("la pellicule passe d'une capture à l'autre", async () => {
      await page
        .locator('[data-shot-strip="boutique/2026-09-05/panier.png"]')
        .click();

      await expect(page.locator("[data-shot-viewer]")).toHaveAttribute(
        "data-shot-viewer",
        "boutique/2026-09-05/panier.png"
      );

      await page.keyboard.press("Escape");
      await expect(page.locator("[data-shot-viewer]")).toHaveCount(0);
    });

    await test.step("Enregistrer… demande la boîte, puis écrit les octets où elle a pointé", async () => {
      // The native save dialog never opens under the harness: answer its path directly.
      await running.app.evaluate(({ ipcMain }, target: string) => {
        ipcMain.removeHandler("transfer:pick-save");
        ipcMain.handle("transfer:pick-save", () => target);
      }, "/tmp/pupitre-e2e/accueil.png");

      await page
        .getByRole("button", { exact: true, name: "Voir accueil.png" })
        .click();
      await expect(page.locator("[data-shot-viewer]")).toBeVisible();

      await page.getByRole("button", { name: "Enregistrer…" }).click();

      await expect(page.locator("[data-shot-saved]")).toHaveAttribute(
        "data-shot-saved",
        "/tmp/pupitre-e2e/accueil.png"
      );
      await expect(
        page.getByText("Enregistrée dans /tmp/pupitre-e2e/accueil.png")
      ).toBeVisible();

      expect(await savedShots(running.app)).toEqual([
        { bytes: PNG.length, path: "/tmp/pupitre-e2e/accueil.png" },
      ]);
    });

    await test.step("une capture supprimée depuis la visionneuse laisse place à sa voisine", async () => {
      const viewer = page.locator("[data-shot-viewer]");

      await viewer.getByRole("button", { name: "Supprimer" }).click();
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: "Supprimer" })
        .click();

      await expect(viewer).toHaveAttribute(
        "data-shot-viewer",
        "boutique/2026-09-05/panier.png"
      );
      await expect(page.locator("[data-shot]")).toHaveCount(1);

      await page.keyboard.press("Escape");
    });
  });
});
