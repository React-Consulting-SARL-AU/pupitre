import { expect, test } from "@playwright/test";
import { assertAccessible } from "./harness/accessible";
import { launchPupitre, type Running } from "./harness/launch";

const REPO = "https://github.com/ada/atlas-web.git";

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

test.describe("new project", () => {
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

        const kept = globalThis as { added?: unknown };

        answer("project:add", (_serverId, params) => {
          kept.added = params;

          const declared = params as {
            processes: {
              routes: { label: string; port: number; subdomain?: string }[];
            }[];
          };

          return {
            ok: true,
            result: {
              ...(params as Record<string, unknown>),
              path: "/home/dev/projects/atlas-web",
              processes: declared.processes.map((process) => ({
                ...process,
                install: "bun install",
                path: "/home/dev/projects/atlas-web",
                routes: process.routes.map(({ label, port, subdomain }) => ({
                  label,
                  port,
                  ...(subdomain
                    ? { hostname: `${subdomain}.example.org` }
                    : {}),
                })),
                state: "stopped",
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
            return {
              ok: true,
              result: {
                done: true,
                installed: [{ command: "bun install", process: "atlas-web" }],
              },
            };
          }

          if (cmd === "project.url") {
            return { ok: true, result: { url: "http://127.0.0.1:3100" } };
          }

          return { ok: true, result: { done: true } };
        });

        answer("project:act", () => {
          const held = (globalThis as { answers?: Record<string, unknown> })
            .answers?.snapshot as
            | { projects: { name: string; state: string }[] }
            | undefined;

          for (const project of held?.projects ?? []) {
            if (project.name === "atlas-web") {
              project.state = "online";
            }
          }

          return { ok: true, result: { state: "online" } };
        });

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

  test("takes a repository from the GitHub account to a live project", async () => {
    const { page } = running;

    await test.step("the dashboard offers the gesture", async () => {
      await page
        .getByRole("button", { name: "Ajouter un projet" })
        .first()
        .click();

      await expect(
        page.getByRole("heading", { name: "Ajouter un projet" })
      ).toBeVisible();
      await expect(
        page.getByRole("radio", { name: GITHUB_CARD })
      ).toBeVisible();
    });

    await test.step("the form passes the accessibility check", async () => {
      await assertAccessible(page, "projects/add");
    });

    await test.step("the source alone is asked for first, and nothing is read until asked", async () => {
      await expect(
        page.getByRole("button", { name: "Lire le dépôt" })
      ).toBeDisabled();
      await expect(page.locator("#project\\.name")).toHaveCount(0);

      await page.getByRole("radio", { name: "Adresse git" }).click();
      await page.locator("#project\\.source").fill(REPO);

      await expect(
        page.getByRole("button", { name: "Lire le dépôt" })
      ).toBeEnabled();
      await expect(page.locator("#project\\.name")).toHaveCount(0);
    });

    await test.step("reading the repository opens the configuration on what it found", async () => {
      await page.getByRole("button", { name: "Lire le dépôt" }).click();

      await expect(page.locator('[data-step="config"]')).toBeVisible();
      await expect(page.locator('[data-source="repo"]')).toContainText(REPO);
      await expect(page.locator('[data-source="branch"]')).toContainText(
        "celle du dépôt"
      );
      await expect(page.locator("#project\\.name")).toHaveValue("atlas-web");
      await expect(
        page.getByText("Lu dans la source : bun, port 3100.")
      ).toBeVisible();
      await expect(
        page.locator("#project\\.processes\\.0\\.ports\\.0\\.port")
      ).toHaveValue("3100");
      await expect(page.locator("#project\\.processes\\.0\\.cmd")).toHaveValue(
        "bun run dev --port 3100"
      );
      await expect(page.locator("#project\\.processes\\.0\\.id")).toHaveValue(
        "atlas-web"
      );
    });

    await test.step("a repository with a dot proposes a valid subdomain", async () => {
      await page.getByRole("button", { name: "Modifier la source" }).click();

      await expect(page.locator('[data-step="source"]')).toBeVisible();

      await page.getByRole("radio", { name: GITHUB_CARD }).click();
      await page.locator("#project\\.repoFilter").fill("my.site");

      await page.getByRole("button", { name: DOTTED_ROW }).click();

      await expect(page.locator('[data-repo="ada/my.site"]')).toBeVisible();
      await expect(page.locator("#project\\.repoFilter")).toBeHidden();
      await expect(page.locator("#project\\.branch")).toHaveValue(
        "release/2.0"
      );

      await page.getByRole("button", { name: "Lire le dépôt" }).click();

      await expect(page.locator('[data-source="branch"]')).toContainText(
        "release/2.0"
      );
      await expect(page.locator("#project\\.name")).toHaveValue("my.site");
      await expect(
        page.locator("#project\\.processes\\.0\\.ports\\.0\\.web")
      ).toHaveValue("my-site");
    });

    await test.step("a refused subdomain is read under the field", async () => {
      await page
        .locator("#project\\.processes\\.0\\.ports\\.0\\.web")
        .fill("-mon.site-");

      await expect(
        page.locator("#project\\.processes\\.0\\.ports\\.0\\.web-problem")
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Créer le projet" })
      ).toBeDisabled();

      await page
        .getByRole("button", { name: "Proposer un sous-domaine libre" })
        .click();

      await expect(
        page.locator("#project\\.processes\\.0\\.ports\\.0\\.web")
      ).toHaveValue("my-site");
      await expect(
        page.getByRole("button", { name: "Créer le projet" })
      ).toBeEnabled();
    });

    await test.step("the chosen repository is the one that gets created", async () => {
      await page.getByRole("button", { name: "Modifier la source" }).click();
      await page.getByRole("button", { name: "Changer de dépôt" }).click();
      await page.locator("#project\\.repoFilter").fill("atlas");
      await page.getByRole("button", { name: ATLAS_ROW }).click();
      await page.getByRole("button", { name: "Lire le dépôt" }).click();

      await expect(page.locator("#project\\.name")).toHaveValue("atlas-web");
      await expect(page.locator('[data-source="branch"]')).toContainText(
        "main"
      );
      await expect(
        page.locator("#project\\.processes\\.0\\.ports\\.0\\.web")
      ).toHaveValue("atlas-web");
    });

    await test.step("a second port is declared, and published or not", async () => {
      await page.getByRole("button", { name: "Ajouter un port" }).click();

      await expect(
        page.locator("#project\\.processes\\.0\\.ports\\.1\\.label")
      ).toHaveValue("api");
      await expect(
        page.locator("#project\\.processes\\.0\\.ports\\.1\\.port")
      ).toHaveValue("3101");
      await expect(
        page.locator("#project\\.processes\\.0\\.ports\\.1\\.web")
      ).toHaveValue("api-atlas-web");

      await page.getByRole("checkbox", { name: "Publier" }).nth(1).uncheck();

      await expect(
        page.locator("#project\\.processes\\.0\\.ports\\.1\\.web")
      ).toBeHidden();
      await assertAccessible(page, "projects/add-ports");
    });

    await test.step("each phase says what it did", async () => {
      await page.getByRole("button", { name: "Créer le projet" }).click();

      await expect(
        page.locator('[data-phase="add"][data-status="ok"]')
      ).toBeVisible();
      await expect(
        page.locator('[data-phase="sources"][data-status="ok"]')
      ).toBeVisible();
      await expect(
        page.locator('[data-phase="install"][data-status="ok"]')
      ).toContainText("atlas-web: bun install");
      await expect(
        page.locator('[data-phase="publish"][data-status="ok"]')
      ).toBeVisible();
      await expect(page.locator('[data-outcome="online"]')).toBeVisible();
      await expect(
        page
          .locator('[data-outcome="online"]')
          .getByText("http://127.0.0.1:3100")
      ).toBeVisible();

      const added = await running.app.evaluate(
        () => (globalThis as { added?: unknown }).added
      );

      expect(added).toMatchObject({
        name: "atlas-web",
        processes: [
          {
            dir: ".",
            id: "atlas-web",
            port: 3100,
            routes: [
              { label: "web", port: 3100, subdomain: "atlas-web" },
              { label: "api", port: 3101 },
            ],
          },
        ],
      });
    });

    await test.step("the project opens on its page", async () => {
      await page.getByRole("button", { name: "Ouvrir le projet" }).click();

      await expect(
        page.getByRole("heading", { name: "atlas-web" })
      ).toBeVisible();
    });
  });
});
