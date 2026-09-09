import { type ElectronApplication, expect, type Page } from "@playwright/test";

/**
 * A machine to install, answered by the harness rather than by a server.
 *
 * The onboarding is the one sequence that touches every channel of the bridge,
 * so its scenario needs them all. Nothing here pretends to be an agent: each
 * channel answers the shape the contract declares, which is exactly what the
 * screens are allowed to depend on.
 */

const PROBE = {
  agent_version: null,
  arch: "amd64",
  disk_free_gb: 80,
  docker: false,
  installed_modules: [],
  os: "Ubuntu",
  panel: null,
  ports: [],
  ram_mb: 4096,
  sudo: true,
  verdict: {
    fixes: [],
    kind: "bare",
    level: "ready",
    reasons: ["Aucun logiciel connu sur cette machine."],
  },
  version: "24.04",
};

const CORE_SYSTEM = {
  arch: ["amd64", "arm64"],
  category: "core",
  conflicts: [],
  fields: [
    {
      default: "Etc/UTC",
      format: "timezone",
      help: "Le fuseau du serveur.",
      hint: { text: "Au format IANA : Europe/Paris, Africa/Casablanca." },
      key: "timezone",
      kind: "text",
      label: "Fuseau horaire",
      required: true,
    },
    {
      help: "Ce que les commits porteront comme auteur.",
      key: "git_name",
      kind: "text",
      label: "Nom git",
      required: true,
    },
    {
      format: "email",
      key: "git_email",
      kind: "text",
      label: "Adresse git",
      required: true,
    },
  ],
  id: "core.system",
  mandatory: true,
  name: "Socle système",
  requires: [],
  resources: { disk_mb: 1200, ram_mb: 256 },
  since: "0.1.0",
  summary: "Paquets de base, fuseau, utilisateur dev, identité git.",
};

const POSTGRES = {
  arch: ["amd64", "arm64"],
  category: "database",
  conflicts: [],
  fields: [
    {
      default: "17",
      key: "version",
      kind: "version",
      label: "Version",
      options: ["18", "17", "16"],
    },
    {
      default: 5432,
      format: "port",
      key: "port",
      kind: "number",
      label: "Port",
      max: 65_535,
      min: 1024,
      required: true,
    },
    {
      generate: true,
      key: "app_password",
      kind: "secret",
      label: "Mot de passe applicatif",
      required: true,
    },
  ],
  id: "db.postgres",
  mandatory: false,
  name: "PostgreSQL",
  requires: ["core.system"],
  resources: { disk_mb: 900, ram_mb: 512 },
  since: "0.1.0",
  summary: "PostgreSQL en local, rôles applicatif et distant.",
};

const CATALOG = {
  modules: [CORE_SYSTEM, POSTGRES],
  presets: [{ id: "minimal", modules: ["core.system"], name: "Minimal" }],
};

export interface Harnessed {
  /** What `install.check` answers: empty unless a scenario wants a refusal. */
  problems?: unknown[];
}

export function answerOnboarding(
  app: ElectronApplication,
  options: Harnessed = {}
): Promise<void> {
  return app.evaluate(
    (
      { ipcMain },
      fixtures: { catalog: unknown; probe: unknown; problems: unknown[] }
    ) => {
      const answer = (
        channel: string,
        reply: (...args: unknown[]) => unknown
      ) => {
        ipcMain.removeHandler(channel);
        ipcMain.handle(channel, (_event, ...args: unknown[]) => reply(...args));
      };

      answer("inspection:probe", () => ({ ok: true, result: fixtures.probe }));
      answer("catalog:list", () => ({ ok: true, result: fixtures.catalog }));

      const marks: Record<string, Record<string, unknown>> = {};

      const mark = (moduleId: unknown, key: unknown, generated: boolean) => {
        const held = marks[String(moduleId)] ?? {};
        held[String(key)] = { filled: true, generated, revealed: false };
        marks[String(moduleId)] = held;

        return { ok: true, result: marks };
      };

      answer("catalog:secret-set", (_id, moduleId, key) =>
        mark(moduleId, key, false)
      );
      answer("catalog:secret-generate", (_id, moduleId, key) =>
        mark(moduleId, key, true)
      );
      answer("catalog:secret-forget", () => undefined);

      answer("install:check", () => ({
        ok: true,
        result: { problems: fixtures.problems, warnings: [] },
      }));

      answer("install:agent-send", () => ({
        ok: true,
        result: {
          arch: "amd64",
          bytes: 18_000_000,
          enrollment: null,
          path: "/usr/local/bin/pupitred",
          sha256: "e2e",
        },
      }));

      answer("install:start", () => ({
        ok: true,
        result: {
          failed: [],
          report_path: "/var/lib/pupitre/report.json",
          warned: [],
        },
      }));

      answer("harden:start", () => ({
        ok: true,
        result: {
          harden: {
            next_user: "dev",
            root_closed: true,
            root_kept: false,
          },
          switched: true,
          user: "dev",
        },
      }));

      answer("platform:sync", () => ({
        ok: true,
        result: {
          heartbeat_at: "2026-09-06T09:00:00Z",
          synced_at: "2026-09-06T09:00:00Z",
        },
      }));

      answer("connections:state", () => ({
        "1password": { status: "absent" },
        cloudflare: { status: "absent" },
        github: { status: "absent" },
        neon: { status: "absent" },
      }));
      answer("connections:zones", () => ({ ok: true, result: [] }));
    },
    { catalog: CATALOG, probe: PROBE, problems: options.problems ?? [] }
  );
}

const INSTALL = /^Installer$/;
const CONFIGURE = /^Continuer avec/;

/**
 * The walk from the servers screen to the configuration.
 *
 * Server, inspection, agent, catalogue: the sequence a reader goes through, in
 * the words the screens use, so a label that changes fails here rather than in
 * five scenarios at once.
 */
export async function reachConfig(
  page: Page,
  options: { pick?: readonly string[] } = {}
): Promise<void> {
  await page.getByRole("button", { name: "Réglages" }).click();
  await page.getByRole("button", { name: "Serveurs" }).click();
  await page.getByRole("button", { name: "Installer Pupitre" }).click();

  await expect(page.getByText("Prête à être installée")).toBeVisible();
  await page.getByRole("button", { name: INSTALL }).first().click();

  await expect(page.getByText("Agent en place")).toBeVisible();
  await page.getByRole("button", { name: "Choisir les services" }).click();

  await expect(page.getByText("Socle système").first()).toBeVisible();

  // The services the scenario adds to the core, ticked on their own card.
  for (const name of options.pick ?? []) {
    await page.getByLabel(name, { exact: true }).check();
  }

  await page.getByRole("button", { name: CONFIGURE }).click();
}
