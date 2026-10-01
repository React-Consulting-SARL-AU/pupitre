import { beforeEach, describe, expect, it } from "bun:test";
import type { CommandName } from "@pupitre/shared/agent-protocol";
import type { BackupRestoreSetupResult } from "@pupitre/shared/agent-protocol/backup";
import type { PlatformBackup } from "@shared/backups";
import {
  CORE_SYSTEM,
  DB_POSTGRES,
  EXPOSURE_CLOUDFLARE,
} from "../../__tests__/catalog-fixtures";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { useCatalog } from "../catalog";
import { useOnboarding } from "../onboarding";
import { useRestore } from "../restore";

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
    key: `pupitre/srv-old/${BACKUP_ID}`,
    path_style: true,
    region: "auto",
    sha256: "e".repeat(64),
  },
  recipient: "A".repeat(43).concat("="),
  server_id: "srv-old",
  server_name: "atelier",
  trigger: "schedule",
} satisfies PlatformBackup;

const SETUP: BackupRestoreSetupResult = {
  defer: [],
  dropped: [],
  extra: [],
  id: BACKUP_ID,
  modules: ["core.system", "db.postgres", "exposure.cloudflare"],
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
      key: "db-postgres-flyleaf.pupitre",
      kind: "database",
      name: "flyleaf",
      sha256: "b".repeat(64),
    },
  ],
  projects: ["intranet"],
  warnings: [],
};

const CONFIG: Partial<Record<string, { values: object; secrets: string[] }>> = {
  "core.system": {
    secrets: [],
    values: { git_email: "ada@pupitre.studio", git_name: "Ada" },
  },
  "db.postgres": { secrets: ["app_password", "remote_password"], values: {} },
  "exposure.cloudflare": {
    secrets: ["tunnel_secret"],
    values: { domain: "ada.dev", tunnel_id: "tun-1" },
  },
};

function server(overrides: Parameters<typeof stubPupitre>[0] = {}) {
  const generated: string[] = [];

  stubPupitre({
    agentCall: (_serverId: string, cmd: CommandName, params?: unknown) => {
      const id = (params as { id?: string } | undefined)?.id ?? "";
      const held = cmd === "module.config" ? CONFIG[id] : undefined;

      return Promise.resolve(
        held
          ? { ok: true, result: { id, ...held } }
          : { error: { code: "internal", message: "rien" }, ok: false }
      );
    },
    catalog: () =>
      Promise.resolve({
        ok: true,
        result: {
          modules: [CORE_SYSTEM, DB_POSTGRES, EXPOSURE_CLOUDFLARE],
          presets: [],
        },
      }),
    generateInstallSecret: (
      _serverId: string,
      moduleId: string,
      key: string
    ) => {
      generated.push(`${moduleId}.${key}`);

      return Promise.resolve({ ok: true, result: {} });
    },
    listBackups: () => Promise.resolve({ ok: true, result: [BACKUP] }),
    restoreBackupSetup: () => Promise.resolve({ ok: true, result: SETUP }),
    ...overrides,
  });

  return { generated };
}

beforeEach(() => {
  useRestore.getState().reset();
  useCatalog.getState().reset();
  useOnboarding.getState().reset();
});

describe("starting from a backup during onboarding", () => {
  it("counts the organization's backups", async () => {
    server();

    expect(await useRestore.getState().list()).toBe(1);
    expect(useRestore.getState().backups).toMatchObject({ status: "read" });
  });

  it("opens the catalogue on the backup choice, regenerating nothing", async () => {
    const { generated } = server();

    const taken = await useRestore
      .getState()
      .start(SERVER, BACKUP_ID, "phrase de passe de test");

    const catalog = useCatalog.getState();

    expect(taken).toBe(true);
    expect(catalog.selected).toEqual(
      expect.arrayContaining([
        "core.system",
        "db.postgres",
        "exposure.cloudflare",
      ])
    );
    expect(catalog.values["core.system"]).toMatchObject({ git_name: "Ada" });
    expect(generated).toEqual([]);
    expect(catalog.problems()).toEqual([]);
    expect(useRestore.getState().restored).toEqual({
      backupId: BACKUP_ID,
      parts: [SETUP.parts[1]],
    });
  });

  it("keeps the catalogue intact when the passphrase is refused", async () => {
    server({
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

    const taken = await useRestore
      .getState()
      .start(SERVER, BACKUP_ID, "mauvaise phrase");

    expect(taken).toBe(false);
    expect(useRestore.getState().setup).toMatchObject({ status: "failed" });
    expect(useCatalog.getState().catalog.status).toBe("idle");
  });

  it("leads onboarding to the catalogue once the configuration is in place", async () => {
    server();

    const store = useOnboarding.getState();

    store.begin(SERVER);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(useOnboarding.getState().backups).toBe(true);

    store.send({ type: "inspected" });
    expect(useOnboarding.getState().step).toBe("restore");

    await store.restoreFrom(BACKUP_ID, "phrase de passe de test");

    expect(useOnboarding.getState()).toMatchObject({
      restored: BACKUP_ID,
      step: "catalog",
    });
  });

  it("restores the ticked parts and follows their steps", async () => {
    let asked: readonly string[] = [];

    server({
      restoreBackupData: (
        _serverId,
        _backupId,
        parts,
        _passphrase,
        onEvent
      ) => {
        asked = parts;
        onEvent({
          event: "step",
          id: 4,
          module: "core.backup",
          ms: 5300,
          status: "ok",
          step: "db:postgres:flyleaf",
        } as never);

        return Promise.resolve({
          ok: true,
          result: {
            failed: [],
            restored: ["db-postgres-flyleaf.pupitre"],
            started: ["intranet"],
            warnings: [],
          },
        });
      },
    });

    useRestore
      .getState()
      .adopt({ backupId: BACKUP_ID, parts: [SETUP.parts[1] as never] });

    const done = await useRestore
      .getState()
      .bringData(SERVER, ["db-postgres-flyleaf.pupitre"], null);

    expect(done).toBe(true);
    expect(asked).toEqual(["db-postgres-flyleaf.pupitre"]);
    expect(useRestore.getState().steps[0]).toMatchObject({
      id: "core.backup",
      status: "ok",
    });
  });
});
