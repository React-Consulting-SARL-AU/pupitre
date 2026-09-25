import type { ElectronApplication } from "@playwright/test";
import {
  BACKUP_DATABASE_ITEM_PATTERN,
  BACKUP_PROJECT_ITEM_PATTERN,
  BACKUP_EXTRA_PATH_PATTERN as EXTRA_PATH_PATTERN,
} from "@pupitre/shared/backup";
import { SNAPSHOT } from "../../src/renderer/src/__tests__/snapshot-fixtures";

export const BACKUP_ID = "20260919T031500Z-7f3a2c";

const RECIPIENT = "ms1b2m6G3lR0b3v8C9W3dGdtS1XU9Qp3mM5o6f7g8h0=";

const SALT = "AAECAwQFBgcICQoLDA0ODw==";

export const BACKUPS = [
  {
    agent_version: "0.8.0",
    bytes: 61_203_456,
    config_revision: 7,
    counts: { databases: 2, home: true, paths: 1, projects: 3, setup: true },
    created_at: "2026-09-23T03:00:00Z",
    id: "20260923T030000Z-1a2b3c",
    kdf_salt: SALT,
    location: {
      bucket: "pupitre-backups",
      endpoint: "https://acme.r2.cloudflarestorage.com",
      key: "pupitre/srv-platform-1/20260923T030000Z-1a2b3c",
      path_style: true,
      region: "auto",
      sha256: "c".repeat(64),
    },
    recipient: RECIPIENT,
    server_id: "srv-platform-1",
    server_name: "atelier",
    trigger: "schedule",
  },
  {
    agent_version: "0.8.0",
    bytes: 48_217_802,
    config_revision: 7,
    counts: { databases: 1, home: true, paths: 0, projects: 2, setup: true },
    created_at: "2026-09-19T03:15:00Z",
    id: BACKUP_ID,
    kdf_salt: SALT,
    name: "Avant la migration",
    location: {
      bucket: "pupitre-backups",
      endpoint: "https://acme.r2.cloudflarestorage.com",
      key: `pupitre/srv-platform-1/${BACKUP_ID}`,
      path_style: true,
      region: "auto",
      sha256: "e".repeat(64),
    },
    recipient: RECIPIENT,
    server_id: "srv-platform-1",
    server_name: "atelier",
    trigger: "manual",
  },
];

export const CORE_BACKUP = {
  arch: ["amd64", "arm64"],
  category: "core",
  conflicts: [],
  connection: "backup",
  fields: [
    {
      key: "endpoint",
      kind: "text",
      label: "Endpoint",
      managed: true,
      required: true,
    },
    {
      default: "auto",
      key: "region",
      kind: "text",
      label: "Région",
      managed: true,
      required: true,
    },
    {
      key: "bucket",
      kind: "text",
      label: "Bucket",
      managed: true,
      required: true,
    },
    {
      default: "pupitre",
      key: "prefix",
      kind: "text",
      label: "Préfixe",
      managed: true,
      required: true,
    },
    {
      default: true,
      key: "path_style",
      kind: "boolean",
      label: "Adressage par chemin",
      managed: true,
    },
    {
      key: "access_key_id",
      kind: "text",
      label: "Identifiant",
      managed: true,
      required: true,
    },
    {
      key: "secret_access_key",
      kind: "secret",
      label: "Clé secrète",
      managed: true,
      required: true,
    },
    {
      key: "recipient",
      kind: "text",
      label: "Clé publique",
      managed: true,
      required: true,
    },
    {
      key: "kdf_salt",
      kind: "text",
      label: "Sel",
      managed: true,
      required: true,
    },
    {
      default: 24,
      help: "0 : aucune sauvegarde planifiée, seulement à la demande.",
      key: "interval_hours",
      kind: "number",
      label: "Intervalle, en heures",
      max: 720,
      pattern: "^[0-9]+$",
      required: true,
    },
    {
      default: 3,
      help: "Heure du serveur où part une sauvegarde d'un jour ou plus.",
      key: "hour",
      kind: "number",
      label: "Heure de départ",
      max: 23,
      pattern: "^[0-9]+$",
      required: true,
    },
    {
      default: 14,
      help: "Les plus anciennes au-delà sont effacées ; une sauvegarde manuelle ne l'est jamais.",
      key: "keep",
      kind: "number",
      label: "Sauvegardes planifiées gardées",
      max: 365,
      min: 1,
      required: true,
    },
    {
      default: true,
      key: "databases",
      kind: "boolean",
      label: "Bases de données",
      required: false,
    },
    {
      default: true,
      help: "Clés SSH, identité git, sessions de gh et des agents de code : rien n'est à reconnecter après une restauration.",
      key: "home",
      kind: "boolean",
      label: "Clés et sessions du compte dev",
      required: false,
    },
    {
      default: true,
      key: "projects",
      kind: "boolean",
      label: "Projets",
      required: false,
    },
    {
      default: false,
      help: "Le code revient alors par un clone : les modifications non commitées et les commits non pushés ne reviennent pas. Un projet sans dépôt est toujours sauvegardé en entier.",
      key: "projects_env_only",
      kind: "boolean",
      label: "Seulement leurs fichiers d'environnement",
      required: false,
    },
    {
      help: "Chemins relatifs à /home/dev.",
      items: "text",
      key: "extra_paths",
      kind: "list",
      label: "Dossiers en plus",
      max: 20,
      pattern: EXTRA_PATH_PATTERN,
      required: false,
    },
    {
      help: "Tous les autres partent, ceux ajoutés plus tard compris.",
      items: "text",
      key: "exclude_projects",
      kind: "list",
      label: "Projets laissés hors des sauvegardes",
      pattern: BACKUP_PROJECT_ITEM_PATTERN,
      required: false,
    },
    {
      help: "moteur:nom, ou redis:* pour le snapshot Redis. Toutes les autres partent, celles créées plus tard comprises.",
      items: "text",
      key: "exclude_databases",
      kind: "list",
      label: "Bases laissées hors des sauvegardes",
      pattern: BACKUP_DATABASE_ITEM_PATTERN,
      required: false,
    },
  ],
  id: "core.backup",
  mandatory: false,
  name: "Sauvegardes",
  requires: ["core.system"],
  resources: { disk_mb: 0, ram_mb: 0 },
  runs: false,
  since: "0.8.0",
  summary: "Sauvegardes chiffrées vers un bucket S3.",
};

// Read with the module's values below: `mysql:archives` excludes a database the server no longer holds.
const CONTENTS = {
  databases: [
    { engine: "postgres", included: true, item: "postgres:shop", name: "shop" },
    {
      engine: "postgres",
      included: true,
      item: "postgres:flyleaf",
      name: "flyleaf",
    },
    {
      engine: "mysql",
      included: true,
      item: "mysql:intranet",
      name: "intranet",
    },
    { engine: "redis", included: false, item: "redis:*", name: "*" },
  ],
  projects: [
    { included: true, name: "flyleaf-api", repo: true },
    { included: true, name: "atlas-web", repo: true },
    { included: true, name: "billing", repo: false },
  ],
  unreadable: ["mongodb"],
};

const STATUS = {
  configured: true,
  interval_hours: 24,
  keep: 14,
  last: {
    at: "2026-09-23T03:00:00Z",
    bytes: 61_203_456,
    id: "20260923T030000Z-1a2b3c",
    ok: true,
  },
  next_run_at: "2026-09-25T03:00:00Z",
  running: false,
};

export const RESTORE_SETUP = {
  defer: [],
  dropped: [],
  extra: ["tool.github"],
  id: BACKUP_ID,
  modules: ["core.system", "db.postgres", "core.backup"],
  parts: [
    {
      bytes: 3812,
      key: "setup.pupitre",
      kind: "setup",
      sha256: "a".repeat(64),
    },
    {
      bytes: 90_112,
      key: "home.pupitre",
      kind: "home",
      paths: [".ssh", ".gitconfig", ".claude"],
      sha256: "f".repeat(64),
    },
    {
      bytes: 48_213_990,
      engine: "postgres",
      format: "pg_custom",
      key: "db-postgres-flyleaf.pupitre",
      kind: "database",
      name: "flyleaf",
      sha256: "b".repeat(64),
    },
    {
      bytes: 61_302_144,
      key: "project-intranet.pupitre",
      kind: "project",
      mode: "full",
      name: "intranet",
      sha256: "d".repeat(64),
    },
  ],
  projects: ["intranet"],
  warnings: [],
};

export const PASSPHRASE = "atelier-sauvegarde-2026";

export interface BackupsHarness {
  listed?: boolean;
  docker?: boolean;
  configured?: boolean;
}

/** Keeps the scenario off the keychain of whoever runs the suite, while still sealing. */
export function sealInMemory(app: ElectronApplication): Promise<void> {
  return app.evaluate(({ safeStorage }) => {
    Object.assign(safeStorage, {
      decryptString: (value: Buffer) =>
        Buffer.from(value.toString("utf8"), "base64")
          .reverse()
          .toString("utf8"),
      encryptString: (value: string) =>
        Buffer.from(Buffer.from(value, "utf8").reverse().toString("base64")),
      isEncryptionAvailable: () => true,
    });
  });
}

export function markRunning(
  app: ElectronApplication,
  running: boolean
): Promise<void> {
  return app.evaluate((_electron, flag) => {
    (globalThis as { backupRunning?: boolean }).backupRunning = flag;
  }, running);
}

export function streamedCalls(
  app: ElectronApplication
): Promise<{ cmd: string; params: Record<string, unknown> }[]> {
  return app.evaluate(
    () =>
      ((globalThis as { streamed?: unknown[] }).streamed ?? []) as {
        cmd: string;
        params: Record<string, unknown>;
      }[]
  );
}

export function installedConfigs(
  app: ElectronApplication
): Promise<
  { modules: string[]; config: Record<string, Record<string, unknown>> }[]
> {
  return app.evaluate(
    () =>
      ((globalThis as { installed?: unknown[] }).installed ?? []) as {
        modules: string[];
        config: Record<string, Record<string, unknown>>;
      }[]
  );
}

/** Answers the main process's probe write and delete in place of the S3 provider. */
export function answerBucket(
  app: ElectronApplication,
  refusal: { status: number; code: string } | null = null
): Promise<void> {
  return app.evaluate((_electron, answer) => {
    const held = globalThis as {
      realFetch?: typeof fetch;
    };

    held.realFetch ??= globalThis.fetch;

    globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
      if (!String(input).includes(".pupitre-probe-")) {
        return (held.realFetch as typeof fetch)(input, init);
      }

      return Promise.resolve(
        answer
          ? new Response(
              `<Error><Code>${answer.code}</Code><Message>refused</Message></Error>`,
              { status: answer.status }
            )
          : new Response(null, { status: 200 })
      );
    }) as typeof fetch;
  }, refusal);
}

export function answerSecondComputer(app: ElectronApplication): Promise<void> {
  return app.evaluate(
    ({ ipcMain }, identity: { recipient: string; kdf_salt: string }) => {
      let held: Record<string, unknown> | null = null;

      const answer = (
        channel: string,
        reply: (...args: unknown[]) => unknown
      ) => {
        ipcMain.removeHandler(channel);
        ipcMain.handle(channel, (_event, ...args: unknown[]) => reply(...args));
      };

      answer("backup:connection", () => held);
      answer("backup:connect", (input) => {
        const {
          passphrase: _passphrase,
          secret_access_key: _secret,
          ...storage
        } = input as Record<string, unknown>;

        held = { ...storage, ...identity };

        return { ok: true, result: held };
      });
      answer("connections:state", () => ({
        "1password": { status: "absent" },
        backup: held
          ? {
              account: { id: held.bucket, name: held.bucket },
              sealed: true,
              status: "connected",
            }
          : { status: "absent" },
        cloudflare: { status: "absent" },
        github: { status: "absent" },
        neon: { status: "absent" },
        stripe: { status: "absent" },
        supabase: { status: "absent" },
        vercel: { status: "absent" },
        wrangler: { status: "absent" },
      }));
    },
    { kdf_salt: SALT, recipient: RECIPIENT }
  );
}

export function answerBackups(
  app: ElectronApplication,
  options: BackupsHarness = {}
): Promise<void> {
  return app.evaluate(
    (
      { ipcMain },
      fixtures: {
        backups: unknown[];
        manifest: unknown;
        passphrase: string;
        setup: unknown;
        snapshot: unknown;
        status: Record<string, unknown>;
        contents: unknown;
        configured: boolean;
        recipient: string;
        salt: string;
      }
    ) => {
      const answer = (
        channel: string,
        reply: (...args: unknown[]) => unknown
      ) => {
        ipcMain.removeHandler(channel);
        ipcMain.handle(channel, (_event, ...args: unknown[]) => reply(...args));
      };

      const held = globalThis as { answers?: Record<string, unknown> };
      const answers = held.answers ?? {};
      let configured = fixtures.configured;
      const values: Record<string, Record<string, unknown>> = {
        "core.backup": {
          access_key_id: "AKIA-SERVER",
          bucket: "pupitre-backups",
          databases: true,
          endpoint: "https://acme.r2.cloudflarestorage.com",
          kdf_salt: fixtures.salt,
          path_style: true,
          prefix: "pupitre",
          recipient: fixtures.recipient,
          region: "auto",
          home: true,
          hour: 3,
          interval_hours: 24,
          exclude_databases: ["redis:*", "mysql:archives"],
          exclude_projects: [],
          extra_paths: [".config/zed"],
          keep: 14,
          projects: true,
          projects_env_only: false,
        },
        "core.system": {
          git_email: "ada@pupitre.studio",
          git_name: "Ada Lovelace",
          timezone: "Europe/Paris",
        },
      };
      const secrets: Record<string, string[]> = {
        "core.backup": ["secret_access_key"],
        "db.postgres": ["app_password"],
      };

      const moduleConfig = (id: string) => ({
        id,
        secrets: secrets[id] ?? [],
        values: id === "core.backup" && !configured ? {} : (values[id] ?? {}),
      });

      answer("agent:call", (_serverId, cmd, params) => {
        const id = (params as { id?: string } | undefined)?.id ?? "";

        if (cmd === "snapshot") {
          return { ok: true, result: fixtures.snapshot };
        }

        if (cmd === "backup.status") {
          return {
            ok: true,
            result: configured
              ? {
                  ...fixtures.status,
                  running:
                    (globalThis as { backupRunning?: boolean })
                      .backupRunning === true,
                }
              : {
                  ...fixtures.status,
                  configured: false,
                  last: null,
                  next_run_at: null,
                },
          };
        }

        if (cmd === "backup.contents") {
          return { ok: true, result: fixtures.contents };
        }

        if (cmd === "backup.delete") {
          return { ok: true, result: { deleted: true } };
        }

        if (cmd === "module.config") {
          return { ok: true, result: moduleConfig(id) };
        }

        const result = answers[String(cmd)];

        return result === undefined
          ? {
              error: {
                code: "unknown_command",
                message: `Le harnais n'a pas de réponse pour ${String(cmd)}.`,
              },
              ok: false,
            }
          : { ok: true, result };
      });

      (globalThis as { streamed?: unknown[] }).streamed = [];
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
          (globalThis as { streamed?: unknown[] }).streamed?.push({
            cmd,
            params,
          });

          if (
            cmd === "uninstall" &&
            (params as { modules: string[] }).modules.includes("core.backup")
          ) {
            configured = false;
          }

          const step = (name: string) =>
            event.sender.send("agent:event", {
              event: {
                event: "step",
                id: 7,
                ms: 420,
                module: "core.backup",
                status: "ok",
                step: name,
              },
              token,
            });

          if (cmd === "backup.run") {
            for (const name of [
              "setup",
              "home",
              "db:postgres:flyleaf",
              "manifest",
              "declare",
              "prune",
            ]) {
              step(name);
            }
          }

          await new Promise((resolve) => setTimeout(resolve, 300));
          event.sender.send("agent:event", { end: true, token });

          return cmd === "backup.run"
            ? {
                ok: true,
                result: {
                  bytes: 61_210_112,
                  declared: true,
                  id: "20260924T101500Z-a1b2c3",
                  key: "pupitre/srv-platform-1/20260924T101500Z-a1b2c3",
                  parts: [],
                  warnings: [],
                },
              }
            : { ok: true, result: { failed: [] } };
        }
      );

      answer("service:detail", () => ({
        error: { code: "bad_request", message: "core.backup n'a pas d'unité." },
        ok: false,
      }));

      answer("catalog:list", () => ({
        ok: true,
        result: {
          modules: [
            fixtures.manifest,
            {
              arch: ["amd64", "arm64"],
              category: "core",
              conflicts: [],
              fields: [],
              id: "core.system",
              mandatory: true,
              name: "Socle système",
              requires: [],
              resources: { disk_mb: 1200, ram_mb: 256 },
              since: "0.1.0",
              summary:
                "Paquets de base, fuseau, utilisateur dev, identité git.",
            },
            {
              arch: ["amd64", "arm64"],
              category: "database",
              conflicts: [],
              fields: [],
              id: "db.postgres",
              mandatory: false,
              name: "PostgreSQL",
              requires: ["core.system"],
              resources: { disk_mb: 900, ram_mb: 512 },
              since: "0.1.0",
              summary: "PostgreSQL en local.",
            },
            {
              arch: ["amd64", "arm64"],
              category: "tool",
              conflicts: [],
              fields: [],
              id: "tool.github",
              mandatory: false,
              name: "GitHub",
              requires: ["core.system"],
              resources: { disk_mb: 40, ram_mb: 0 },
              since: "0.1.0",
              summary: "Le CLI gh.",
            },
          ],
          presets: [],
        },
      }));

      answer("install:check", () => ({
        ok: true,
        result: { problems: [], warnings: [] },
      }));

      const installs = globalThis as { installed?: unknown[] };

      installs.installed = [];

      answer("install:start", (_token, _serverId, modules, config) => {
        installs.installed?.push({ config, modules });
        configured ||= (modules as string[]).includes("core.backup");

        return {
          ok: true,
          result: {
            failed: [],
            report_path: "/var/lib/pupitre/report.json",
            warned: [],
          },
        };
      });

      answer("backup:identity", () => ({
        ok: true,
        result:
          fixtures.backups.length > 0
            ? {
                created_at: "2026-09-23T03:00:00Z",
                kdf_salt: (fixtures.backups[0] as { kdf_salt: string })
                  .kdf_salt,
                recipient: (fixtures.backups[0] as { recipient: string })
                  .recipient,
                server_name: "atelier",
              }
            : null,
      }));
      answer("backup:list", () => ({ ok: true, result: fixtures.backups }));
      answer("backup:restore-abort", () => ({
        ok: true,
        result: { done: true },
      }));

      ipcMain.removeHandler("backup:restore-setup");
      ipcMain.handle(
        "backup:restore-setup",
        async (
          event,
          token: unknown,
          _serverId: unknown,
          _backupId: unknown,
          passphrase: unknown,
          asked: unknown
        ) => {
          const send = (payload: object) =>
            event.sender.send("backup:restore-update", { token, ...payload });

          await new Promise((resolve) => setTimeout(resolve, 400));

          if (passphrase !== fixtures.passphrase) {
            send({ end: true });

            return {
              error: {
                code: "bad_request",
                message: "refusal.backup.passphrase.wrong",
                phrase: { id: "refusal.backup.passphrase.wrong" },
              },
              ok: false,
            };
          }

          if ((asked as { saveFirst?: boolean }).saveFirst) {
            send({ update: { kind: "phase", phase: "save" } });
            await new Promise((resolve) => setTimeout(resolve, 400));
          }

          send({ update: { kind: "phase", phase: "setup" } });
          await new Promise((resolve) => setTimeout(resolve, 400));
          send({ end: true });

          return { ok: true, result: fixtures.setup };
        }
      );

      ipcMain.removeHandler("backup:restore-data");
      ipcMain.handle(
        "backup:restore-data",
        async (event, token: unknown, _serverId, _backupId, parts: unknown) => {
          for (const part of parts as string[]) {
            event.sender.send("backup:restore-update", {
              token,
              update: {
                event: {
                  event: "step",
                  id: 9,
                  ms: 1800,
                  module: "core.backup",
                  status: "ok",
                  step: part,
                },
                kind: "event",
              },
            });
          }

          await new Promise((resolve) => setTimeout(resolve, 400));
          event.sender.send("backup:restore-update", { end: true, token });

          return {
            ok: true,
            result: {
              failed: [],
              restored: parts,
              started: ["intranet"],
              warnings: [],
            },
          };
        }
      );
    },
    {
      backups: options.listed === false ? [] : BACKUPS,
      manifest: CORE_BACKUP,
      passphrase: PASSPHRASE,
      setup: RESTORE_SETUP,
      snapshot: options.docker
        ? {
            ...SNAPSHOT,
            services: [
              ...SNAPSHOT.services,
              {
                configured: true,
                id: "runtime.docker",
                name: "Docker",
                runs: true,
                state: "running",
              },
            ],
          }
        : SNAPSHOT,
      configured: options.configured !== false,
      contents: CONTENTS,
      recipient: RECIPIENT,
      salt: SALT,
      status: STATUS,
    }
  );
}
