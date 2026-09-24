import { beforeEach, describe, expect, it } from "bun:test";
import type { CommandName } from "@pupitre/shared/agent-protocol";
import type { BackupRestoreSetupResult } from "@pupitre/shared/agent-protocol/backup";
import type { Event } from "@pupitre/shared/agent-protocol/envelope";
import type { AgentResponse } from "@shared/agent";
import type { PlatformBackup, RestoreUpdate } from "@shared/backups";
import { CORE_SYSTEM, DB_POSTGRES } from "../../__tests__/catalog-fixtures";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { useBackups } from "../backups";
import { useInstall } from "../install";

const SERVER = "srv-1";

const BACKUP_ID = "20260919T031500Z-7f3a2c";

const BACKUP = {
  agent_version: "0.8.0",
  bytes: 48_217_802,
  config_revision: 7,
  counts: { databases: 1, home: true, paths: 0, projects: 1, setup: true },
  created_at: "2026-09-19T03:15:00Z",
  id: BACKUP_ID,
  kdf_salt: "AAECAwQFBgcICQoLDA0ODw==",
  location: {
    bucket: "pupitre-backups",
    endpoint: "https://acme.r2.cloudflarestorage.com",
    key: `pupitre/srv-1/${BACKUP_ID}`,
    path_style: true,
    region: "auto",
    sha256: "e".repeat(64),
  },
  recipient: "A".repeat(43).concat("="),
  server_id: "srv-platform-1",
  server_name: "atelier",
  trigger: "manual",
} satisfies PlatformBackup;

const SETUP: BackupRestoreSetupResult = {
  defer: [],
  dropped: [],
  extra: ["tool.github"],
  id: BACKUP_ID,
  modules: ["core.system", "db.postgres"],
  parts: [
    {
      bytes: 3812,
      key: "setup.pupitre",
      kind: "setup",
      sha256: "a".repeat(64),
    },
    {
      bytes: 48_213_990,
      engine: "postgres",
      format: "pg_custom",
      key: "db-postgres-flymate.pupitre",
      kind: "database",
      name: "flymate",
      sha256: "b".repeat(64),
    },
  ],
  projects: ["intranet"],
  warnings: [],
};

const STATUS = {
  configured: true,
  interval_hours: 24,
  keep: 14,
  next_run_at: "2026-09-25T03:00:00Z",
  running: false,
};

const CONTENTS = {
  databases: [
    { engine: "postgres", included: true, item: "postgres:shop", name: "shop" },
  ],
  projects: [{ included: false, name: "billing", repo: false }],
  unreadable: ["mongodb"],
};

const RUN_STEP = {
  event: "step",
  id: 2,
  module: "core.backup",
  ms: 210,
  status: "ok",
  step: "setup",
} as unknown as Event;

interface Calls {
  streamed: { cmd: string; params: unknown }[];
  called: { cmd: string; params: unknown }[];
  installed: { modules: readonly string[]; config: unknown }[];
  data: readonly string[][];
}

function server(
  overrides: Parameters<typeof stubPupitre>[0] = {},
  installResult: AgentResponse<{
    failed: string[];
    warned: string[];
    report_path: string;
  }> = {
    ok: true,
    result: {
      failed: [],
      report_path: "/var/lib/pupitre/report.json",
      warned: [],
    },
  }
): Calls {
  const calls: Calls = { called: [], data: [], installed: [], streamed: [] };

  stubPupitre({
    agentCall: (_serverId: string, cmd: CommandName, params?: unknown) => {
      calls.called.push({ cmd, params });

      if (cmd === "backup.status") {
        return Promise.resolve({ ok: true, result: STATUS });
      }

      if (cmd === "backup.contents") {
        return Promise.resolve({ ok: true, result: CONTENTS });
      }

      if (cmd === "module.config") {
        const id = (params as { id: string }).id;

        return Promise.resolve({
          ok: true,
          result: { id, secrets: [], values: { restored: id } },
        });
      }

      return Promise.resolve({ ok: true, result: { deleted: true } });
    },
    agentStream: (_serverId, cmd, params, onEvent) => {
      calls.streamed.push({ cmd, params });
      onEvent(RUN_STEP);

      return Promise.resolve({
        ok: true,
        result:
          cmd === "backup.run"
            ? {
                bytes: 4096,
                declared: true,
                id: "20260924T101500Z-a1b2c3",
                key: "k",
                parts: [],
                warnings: [],
              }
            : { failed: [] },
      });
    },
    catalog: () =>
      Promise.resolve({
        ok: true,
        result: { modules: [CORE_SYSTEM, DB_POSTGRES], presets: [] },
      }),
    listBackups: () => Promise.resolve({ ok: true, result: [BACKUP] }),
    restoreBackupData: (_serverId, _backupId, parts) => {
      calls.data = [...calls.data, [...parts]];

      return Promise.resolve({
        ok: true,
        result: {
          failed: [],
          restored: [...parts],
          started: ["intranet"],
          warnings: [],
        },
      });
    },
    restoreBackupSetup: (
      _serverId,
      _backupId,
      _passphrase,
      options,
      onUpdate: (update: RestoreUpdate) => void
    ) => {
      if (options.saveFirst) {
        onUpdate({ kind: "phase", phase: "save" });
      }

      onUpdate({ kind: "phase", phase: "setup" });

      return Promise.resolve({ ok: true, result: SETUP });
    },
    startInstall: (_serverId, modules, config) => {
      calls.installed.push({ config, modules });

      return Promise.resolve(installResult);
    },
    ...overrides,
  });

  return calls;
}

beforeEach(() => {
  useBackups.getState().forget();
  useInstall.getState().reset();
});

describe("la page des sauvegardes d'un serveur", () => {
  it("lit l'état de l'agent, la liste de la plateforme et le formulaire du module", async () => {
    server();

    await useBackups.getState().read(SERVER);

    const state = useBackups.getState();

    expect(state.state).toMatchObject({ backup: STATUS, status: "read" });
    expect(state.list).toMatchObject({ backups: [BACKUP], status: "read" });
    expect(state.contents).toMatchObject({
      contents: CONTENTS,
      status: "read",
    });
    expect(state.manifest).toBeNull();
    expect(state.modules.map((one) => one.id)).toEqual([
      "core.system",
      "db.postgres",
    ]);
  });

  it("sauvegarde maintenant, en suivant les étapes, puis relit la liste", async () => {
    const calls = server();

    await useBackups.getState().runNow(SERVER);

    expect(calls.streamed.map((one) => one.cmd)).toEqual(["backup.run"]);
    expect(useBackups.getState().run).toMatchObject({ status: "done" });
    expect(useBackups.getState().steps[0]?.id).toBe("core.backup");
    expect(useBackups.getState().list.status).toBe("read");
  });

  it("supprime une sauvegarde par l'agent, qui efface le seau puis la plateforme", async () => {
    const calls = server();

    await useBackups.getState().remove(SERVER, BACKUP_ID);

    expect(calls.called).toContainEqual({
      cmd: "backup.delete",
      params: { id: BACKUP_ID },
    });
    expect(useBackups.getState().removing).toBeNull();
  });
});

describe("revenir à une sauvegarde", () => {
  it("reste sur la question quand la phrase est refusée, sans rien installer", async () => {
    const calls = server({
      restoreBackupSetup: () =>
        Promise.resolve({
          error: {
            code: "bad_request",
            message: "refusal.backup.passphrase.wrong",
            phrase: { id: "refusal.backup.passphrase.wrong" },
          },
          ok: false,
        }),
    });

    await useBackups
      .getState()
      .revertTo(SERVER, BACKUP, "mauvaise phrase", true);

    expect(useBackups.getState().revert).toMatchObject({
      status: "refused",
    });
    expect(calls.installed).toEqual([]);
  });

  it("installe ce que la sauvegarde tient, demande pour le reste, puis ramène les données", async () => {
    const calls = server();

    await useBackups.getState().revertTo(SERVER, BACKUP, "bonne phrase", true);

    expect(calls.installed).toEqual([
      {
        config: {
          "core.system": { restored: "core.system" },
          "db.postgres": { restored: "db.postgres" },
        },
        modules: ["core.system", "db.postgres"],
      },
    ]);
    expect(useBackups.getState().revert).toMatchObject({
      extra: ["tool.github"],
      status: "choosing",
    });

    await useBackups.getState().settleExtra(SERVER, ["tool.github"]);

    expect(calls.streamed).toContainEqual({
      cmd: "uninstall",
      params: { modules: ["tool.github"] },
    });
    expect(calls.data).toEqual([["db-postgres-flymate.pupitre"]]);
    expect(useBackups.getState().revert).toMatchObject({
      result: { started: ["intranet"] },
      status: "done",
    });
  });

  it("s'arrête sur l'installation quand un service n'a pas pris", async () => {
    const calls = server(
      {},
      {
        ok: true,
        result: {
          failed: ["db.postgres"],
          report_path: "/var/lib/pupitre/report.json",
          warned: [],
        },
      }
    );

    await useBackups.getState().revertTo(SERVER, BACKUP, "bonne phrase", false);

    expect(useBackups.getState().revert).toMatchObject({
      error: { phrase: { id: "refusal.backup.install.failed" } },
      phase: "install",
      status: "failed",
    });
    expect(calls.data).toEqual([]);
  });
});
