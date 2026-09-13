import { expect, test } from "@playwright/test";
import { assertAccessible } from "./harness/accessible";
import { launchPupitre, type Running } from "./harness/launch";

/**
 * A project added from the dashboard, from the source to the journal.
 *
 * The dashboard used to offer no way in at all: the agent had the commands and
 * the main process the channels, and no screen asked for either. The scenario
 * walks the three ways in, the phases and the outcome against answers shaped
 * like the contract, and ends on the project the snapshot already lists.
 */
const REPO = "https://github.com/ada/atlas-web.git";

/** The cards, the rows and the outcome, named the way the window names them. */
const GITHUB_CARD = /^GitHub/;
const DOTTED_ROW = /ada\/my\.site/;
const ATLAS_ROW = /ada\/atlas-web/;

const REPOS = [
  {
    cloneUrl: "https://github.com/ada/my.site.git",
    defaultBranch: "release/2.0",
    fullName: "ada/my.site",
    name: "my.site",
    owner: "ada",
    private: false,
    pushedAt: "2026-09-01T10:00:00Z",
  },
  {
    cloneUrl: REPO,
    defaultBranch: "main",
    fullName: "ada/atlas-web",
    name: "atlas-web",
    owner: "ada",
    private: false,
    pushedAt: "2026-08-20T10:00:00Z",
  },
];

test.describe("nouveau projet", () => {
  let running: Running;

  test.beforeAll(async () => {
    running = await launchPupitre();

    await running.app.evaluate(
      ({ ipcMain }, fixtures: { repos: unknown }) => {
        const answer = (
          channel: string,
          reply: (...args: unknown[]) => unknown
        ) => {
          ipcMain.removeHandler(channel);
          ipcMain.handle(channel, (_event, ...args: unknown[]) =>
            reply(...args)
          );
        };

        answer("project:list", () => ({ ok: true, result: { projects: [] } }));

        answer("github:repos", () => ({ ok: true, result: fixtures.repos }));

        // What the window sent is kept, so the scenario reads the routes it
        // declared rather than trusting the phases alone.
        const kept = globalThis as { added?: unknown };

        answer("project:add", (_serverId, params) => {
          kept.added = params;

          const declared = params as {
            routes: { label: string; port: number; subdomain?: string }[];
          };

          return {
            ok: true,
            result: {
              ...(params as Record<string, unknown>),
              install: "bun install",
              path: "/home/dev/projects/atlas-web",
              routes: declared.routes.map(({ label, port, subdomain }) => ({
                label,
                port,
                ...(subdomain ? { hostname: `${subdomain}.example.org` } : {}),
              })),
              state: "stopped",
            },
          };
        });

        answer("project:on", (cmd) => {
          if (cmd === "project.pull") {
            return { ok: true, result: { pulled: true, state: "stopped" } };
          }

          if (cmd === "project.install") {
            return { ok: true, result: { command: "bun install", done: true } };
          }

          if (cmd === "project.url") {
            return { ok: true, result: { url: "http://127.0.0.1:3100" } };
          }

          return { ok: true, result: { done: true } };
        });

        answer("project:act", () => ({
          ok: true,
          result: { port: 3100, state: "online" },
        }));

        answer("project:logs", () => ({
          ok: true,
          result: { lines: ["atlas-web ready on http://127.0.0.1:3100"] },
        }));

        answer("tunnel:records", () => ({ ok: true, result: 1 }));
      },
      { repos: REPOS }
    );
  });

  test.afterAll(async () => {
    await running.app.close();
  });

  test("mène un dépôt du compte GitHub jusqu'à un projet en ligne", async () => {
    const { page } = running;

    await test.step("le tableau de bord offre le geste", async () => {
      await page
        .getByRole("button", { name: "Nouveau projet" })
        .first()
        .click();

      await expect(
        page.getByRole("heading", { name: "atelier" })
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: GITHUB_CARD })
      ).toBeVisible();
    });

    await test.step("l'accessibilité du formulaire tient", async () => {
      await assertAccessible(page, "projects/add");
    });

    await test.step("une adresse git remplit le reste, et l'agent la lit", async () => {
      await page.getByRole("button", { name: "Adresse git" }).click();
      await page.locator("#project\\.source").fill(REPO);
      await page.locator("#project\\.name").focus();

      await expect(page.locator("#project\\.name")).toHaveValue("atlas-web");
      await expect(
        page.getByText("Lu dans la source : bun, port 3100.")
      ).toBeVisible();
      await expect(page.locator("#project\\.ports\\.0\\.port")).toHaveValue(
        "3100"
      );
      await expect(page.locator("#project\\.cmd")).toHaveValue(
        "bun run dev --port 3100"
      );
    });

    /**
     * The repository whose name carries a dot: the subdomain proposed is the
     * folded one, which the agent accepts, and not the name, which it refuses.
     */
    await test.step("un dépôt à point propose un sous-domaine valide", async () => {
      await page.getByRole("button", { name: GITHUB_CARD }).click();
      await page.locator("#project\\.repoFilter").fill("my.site");

      await page.getByRole("button", { name: DOTTED_ROW }).click();

      await expect(page.locator('[data-repo="ada/my.site"]')).toBeVisible();
      await expect(page.locator("#project\\.repoFilter")).toBeHidden();
      await expect(page.locator("#project\\.name")).toHaveValue("my.site");
      await expect(page.locator("#project\\.branch")).toHaveValue(
        "release/2.0"
      );
      await expect(page.locator("#project\\.ports\\.0\\.web")).toHaveValue(
        "my-site"
      );
    });

    await test.step("un sous-domaine refusé se lit sous le champ", async () => {
      await page.locator("#project\\.ports\\.0\\.web").fill("-mon.site-");

      await expect(
        page.locator("#project\\.ports\\.0\\.web-problem")
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Créer le projet" })
      ).toBeDisabled();

      await page
        .getByRole("button", { name: "Proposer un sous-domaine libre" })
        .click();

      await expect(page.locator("#project\\.ports\\.0\\.web")).toHaveValue(
        "my-site"
      );
      await expect(
        page.getByRole("button", { name: "Créer le projet" })
      ).toBeEnabled();
    });

    await test.step("le dépôt choisi est celui qu'on crée", async () => {
      await page.getByRole("button", { name: "Changer de dépôt" }).click();
      await page.locator("#project\\.repoFilter").fill("atlas");
      await page.getByRole("button", { name: ATLAS_ROW }).click();

      await expect(page.locator("#project\\.name")).toHaveValue("atlas-web");
      await expect(page.locator("#project\\.branch")).toHaveValue("main");
      await expect(page.locator("#project\\.ports\\.0\\.web")).toHaveValue(
        "atlas-web"
      );
    });

    /**
     * A second port, on a free number and under a name derived from the first,
     * published or not as the reader decides: the agent gets both routes.
     */
    await test.step("un second port se déclare, et se publie ou non", async () => {
      await page.getByRole("button", { name: "Ajouter un port" }).click();

      await expect(page.locator("#project\\.ports\\.1\\.label")).toHaveValue(
        "api"
      );
      await expect(page.locator("#project\\.ports\\.1\\.port")).toHaveValue(
        "3101"
      );
      await expect(page.locator("#project\\.ports\\.1\\.web")).toHaveValue(
        "api-atlas-web"
      );

      await page.getByRole("checkbox", { name: "Publier" }).nth(1).uncheck();

      await expect(page.locator("#project\\.ports\\.1\\.web")).toBeHidden();
      await assertAccessible(page, "projects/add-ports");
    });

    await test.step("chaque phase dit ce qu'elle a fait", async () => {
      await page.getByRole("button", { name: "Créer le projet" }).click();

      await expect(
        page.locator('[data-phase="add"][data-status="ok"]')
      ).toBeVisible();
      await expect(
        page.locator('[data-phase="sources"][data-status="ok"]')
      ).toBeVisible();
      await expect(
        page.locator('[data-phase="install"][data-status="ok"]')
      ).toContainText("bun install");
      await expect(
        page.locator('[data-phase="publish"][data-status="ok"]')
      ).toBeVisible();
      await expect(page.locator('[data-outcome="online"]')).toBeVisible();
      await expect(
        page.getByText("http://127.0.0.1:3100 · port 3100")
      ).toBeVisible();

      const added = await running.app.evaluate(
        () => (globalThis as { added?: unknown }).added
      );

      expect(added).toMatchObject({
        name: "atlas-web",
        port: 3100,
        routes: [
          { label: "web", port: 3100, subdomain: "atlas-web" },
          { label: "api", port: 3101 },
        ],
      });
    });

    await test.step("le projet s'ouvre sur sa page", async () => {
      await page.getByRole("button", { name: "Ouvrir le projet" }).click();

      await expect(
        page.getByRole("heading", { name: "atlas-web" })
      ).toBeVisible();
    });
  });
});
