import { describe, expect, it } from "bun:test";
import type { Event } from "@pupitre/shared/agent-protocol/envelope";
import {
  deriveBackupIdentity,
  normalizePassphrase,
} from "@pupitre/shared/backup/crypto";
import type {
  BackupConnectionView,
  OrganizationIdentity,
  PlatformBackup,
  RestoreUpdate,
} from "@shared/backups";
import { createAgentClient } from "../agent-client";
import {
  backupManaged,
  type ConnectDeps,
  connectBackup,
  type DataDeps,
  type HeldBackup,
  latestIdentity,
  probeConnection,
  restoreData,
  restoreSetup,
  type SetupDeps,
  type Unlocked,
} from "../backups-run";
import { fakeAgent } from "./fixtures/fake-agent";

const SERVER = "atelier";

const PASSPHRASE = "pupitre sauvegarde de test";

const SALT = "AAECAwQFBgcICQoLDA0ODw==";

/** A thousand rounds keep the test fast; the derivation itself is the contract's. */
const derive = (passphrase: string, salt: string) =>
  deriveBackupIdentity(passphrase, salt, 1000);

const STORAGE = {
  access_key_id: "AKIA-E2E",
  bucket: "pupitre-backups",
  endpoint: "https://acme.r2.cloudflarestorage.com",
  path_style: true,
  prefix: "pupitre",
  region: "auto",
};

async function identity(): Promise<{ recipient: string; kdf_salt: string }> {
  const derived = await derive(PASSPHRASE, SALT);

  return { kdf_salt: SALT, recipient: derived.recipient };
}

async function held(): Promise<HeldBackup> {
  return { secret: "s3-secret", view: { ...STORAGE, ...(await identity()) } };
}

async function backup(): Promise<PlatformBackup> {
  const { recipient, kdf_salt } = await identity();

  return {
    agent_version: "0.8.0",
    bytes: 48_217_802,
    config_revision: 7,
    counts: { databases: 1, home: false, paths: 0, projects: 0, setup: true },
    created_at: "2026-09-19T03:15:00Z",
    id: "20260919T031500Z-7f3a2c",
    kdf_salt,
    location: {
      bucket: "pupitre-backups",
      endpoint: "https://acme.r2.cloudflarestorage.com",
      key: "pupitre/srv-platform-1/20260919T031500Z-7f3a2c",
      path_style: true,
      region: "auto",
      sha256: "e".repeat(64),
    },
    recipient,
    server_id: "srv-platform-1",
    server_name: "atelier",
    trigger: "schedule",
  };
}

function connectDeps(
  overrides: Partial<ConnectDeps> = {}
): ConnectDeps & { kept: { view: BackupConnectionView; secret: string }[] } {
  const kept: { view: BackupConnectionView; secret: string }[] = [];

  return {
    derive,
    drawSalt: () => SALT,
    held: () => null,
    identity: () => Promise.resolve({ ok: true, result: null }),
    keep: (view, secret) => kept.push({ secret, view }),
    kept,
    normalize: normalizePassphrase,
    probe: () => Promise.resolve({ ok: true, result: null }),
    ...overrides,
  };
}

describe("the backups connection", () => {
  it("derives the passphrase and keeps only the public key and the salt", async () => {
    const deps = connectDeps();

    const answer = await connectBackup(
      { ...STORAGE, passphrase: PASSPHRASE, secret_access_key: "s3-secret" },
      deps
    );

    expect(answer).toEqual({
      ok: true,
      result: { ...STORAGE, ...(await identity()) },
    });
    expect(JSON.stringify(deps.kept)).not.toContain(PASSPHRASE);
    expect(deps.kept[0]?.secret).toBe("s3-secret");
  });

  it("reuses the organization's identity without asking for the passphrase", async () => {
    const adopted: OrganizationIdentity = {
      ...(await identity()),
      created_at: "2026-09-19T03:15:00Z",
      server_name: "atelier",
    };
    const deps = connectDeps({
      identity: () => Promise.resolve({ ok: true, result: adopted }),
    });

    const answer = await connectBackup(
      { ...STORAGE, secret_access_key: "s3-secret" },
      deps
    );

    expect(answer).toMatchObject({ ok: true, result: await identity() });
  });

  it("refuses a first connection without a passphrase when the organization has nothing", async () => {
    const answer = await connectBackup(
      { ...STORAGE, secret_access_key: "s3-secret" },
      connectDeps()
    );

    expect(answer).toMatchObject({
      error: { phrase: { id: "refusal.backup.passphrase.none" } },
      ok: false,
    });
  });

  it("refuses a passphrase that is too short, before any derivation", async () => {
    let derived = 0;
    const answer = await connectBackup(
      { ...STORAGE, passphrase: "court", secret_access_key: "s3-secret" },
      connectDeps({
        derive: (passphrase, salt) => {
          derived += 1;

          return derive(passphrase, salt);
        },
      })
    );

    expect(answer).toMatchObject({
      error: { phrase: { id: "refusal.backup.passphrase.short" } },
      ok: false,
    });
    expect(derived).toBe(0);
  });

  it("keeps the held secret key and identity when only the bucket changes", async () => {
    const before = await held();
    const deps = connectDeps({ held: () => before });

    const answer = await connectBackup(
      { ...STORAGE, bucket: "autre-seau" },
      deps
    );

    expect(answer).toMatchObject({
      ok: true,
      result: { bucket: "autre-seau", recipient: before.view.recipient },
    });
    expect(deps.kept[0]?.secret).toBe("s3-secret");
  });

  it("refuses an endpoint that is not an address", async () => {
    const answer = await connectBackup(
      { ...STORAGE, endpoint: "acme", secret_access_key: "s3-secret" },
      connectDeps()
    );

    expect(answer).toMatchObject({
      error: {
        phrase: { id: "refusal.backup.field", values: { field: "endpoint" } },
      },
      ok: false,
    });
  });

  it("keeps nothing when the bucket refuses the trial write", async () => {
    const deps = connectDeps({
      probe: () =>
        Promise.resolve({
          error: {
            code: "bad_request",
            message: "refusal.backup.probe.denied",
            phrase: { id: "refusal.backup.probe.denied" },
          },
          ok: false,
        }),
    });

    const answer = await connectBackup(
      { ...STORAGE, passphrase: PASSPHRASE, secret_access_key: "s3-secret" },
      deps
    );

    expect(answer).toMatchObject({
      error: { phrase: { id: "refusal.backup.probe.denied" } },
      ok: false,
    });
    expect(deps.kept).toEqual([]);
  });

  it("refuses an http endpoint, as signatures would travel in plaintext", async () => {
    const answer = await connectBackup(
      {
        ...STORAGE,
        endpoint: "http://acme.r2.cloudflarestorage.com",
        secret_access_key: "s3-secret",
      },
      connectDeps()
    );

    expect(answer).toMatchObject({
      error: { phrase: { values: { field: "endpoint" } } },
      ok: false,
    });
  });

  it("names the identity of the most recent backup", async () => {
    const older = { ...(await backup()), created_at: "2026-09-01T03:15:00Z" };
    const newer = {
      ...(await backup()),
      created_at: "2026-09-20T03:15:00Z",
      server_name: "vitrine",
    };

    expect(latestIdentity([older, newer])?.server_name).toBe("vitrine");
    expect(latestIdentity([])).toBeNull();
  });
});

describe("the trial write alone", () => {
  it("tests the bucket with the held key when none is typed, and keeps nothing", async () => {
    const before = await held();
    const probed: string[] = [];
    const deps = connectDeps({
      held: () => before,
      probe: (_storage, secret) => {
        probed.push(secret);

        return Promise.resolve({ ok: true, result: null });
      },
    });

    const answer = await probeConnection(
      { ...STORAGE, bucket: "autre-seau" },
      deps
    );

    expect(answer.ok).toBe(true);
    expect(probed).toEqual(["s3-secret"]);
    expect(deps.kept).toEqual([]);
  });

  it("refuses without a secret key, neither typed nor held, writing nothing", async () => {
    let probes = 0;
    const answer = await probeConnection(
      STORAGE,
      connectDeps({
        probe: () => {
          probes += 1;

          return Promise.resolve({ ok: true, result: null });
        },
      })
    );

    expect(answer).toMatchObject({
      error: { phrase: { id: "refusal.backup.secret.none" } },
      ok: false,
    });
    expect(probes).toBe(0);
  });
});

describe("the managed values of core.backup", () => {
  it("gives the bucket as configuration and the secret key on the secrets line", async () => {
    const answer = backupManaged(["core.backup"], await held(), false);

    expect(answer).toEqual({
      ok: true,
      result: {
        config: { "core.backup": { ...STORAGE, ...(await identity()) } },
        secrets: { "core.backup": { secret_access_key: "s3-secret" } },
      },
    });
  });

  it("refuses installation without a connection, except on a restored machine", () => {
    expect(backupManaged(["core.backup"], null, false)).toMatchObject({
      error: { phrase: { values: { kind: "backup" } } },
      ok: false,
    });
    expect(backupManaged(["core.backup"], null, true)).toEqual({
      ok: true,
      result: { config: {}, secrets: {} },
    });
  });
});

describe("restoring a backup", () => {
  it("refuses a wrong passphrase on this laptop, asking nothing of the machine", async () => {
    const listed = await backup();
    const asked: string[] = [];

    const answer = await restoreSetup(
      SERVER,
      listed.id,
      "une autre phrase de passe",
      { revert: true, saveFirst: true },
      () => undefined,
      {
        backups: () => Promise.resolve({ ok: true, result: [listed] }),
        derive,
        held: () => null,
        remember: () => undefined,
        request: (_serverId, cmd) => {
          asked.push(cmd);

          return Promise.resolve({ ok: true, result: {} });
        },
      }
    );

    expect(answer).toMatchObject({ ok: false });
    expect(asked).toEqual([]);
  });

  it("backs up first, places the configuration, then brings the data back", async () => {
    const fake = fakeAgent([
      "backup-revert-work.jsonl",
      "backup-sync-control.jsonl",
    ]);
    const agent = createAgentClient({
      appVersion: "0.1.0",
      backoff: { attempts: 3, firstMs: 5, maxMs: 20 },
      spawn: fake.spawn,
    });
    const listed = await backup();
    const key = await held();
    const updates: RestoreUpdate[] = [];
    const remembered = new Map<string, Unlocked>();
    const noted: string[] = [];
    const deps: SetupDeps & DataDeps = {
      backups: () => Promise.resolve({ ok: true, result: [listed] }),
      derive,
      forget: (serverId) => remembered.delete(serverId),
      held: () => key,
      noteRestored: (backupId, serverId) => {
        noted.push(`${backupId} on ${serverId}`);

        return Promise.resolve();
      },
      recall: (serverId) => remembered.get(serverId) ?? null,
      remember: (serverId, unlocked) => remembered.set(serverId, unlocked),
      request: (serverId, cmd, params, options) =>
        agent.request(serverId, cmd, params as never, options),
      sync: (serverId) => agent.request(serverId, "platform.sync"),
    };

    const setup = await restoreSetup(
      SERVER,
      listed.id,
      PASSPHRASE,
      { revert: true, saveFirst: true },
      (update) => updates.push(update),
      deps
    );

    expect(setup).toMatchObject({
      ok: true,
      result: {
        extra: ["tool.github"],
        modules: ["core.system", "db.postgres"],
      },
    });
    expect(updates.filter((update) => update.kind === "phase")).toEqual([
      { kind: "phase", phase: "save" },
      { kind: "phase", phase: "setup" },
    ]);
    expect(remembered.has(SERVER)).toBe(true);

    const events: Event[] = [];
    const data = await restoreData(
      SERVER,
      listed.id,
      ["db-postgres-flyleaf.pupitre"],
      null,
      (event) => events.push(event),
      deps
    );

    expect(data).toMatchObject({ ok: true, result: { started: ["intranet"] } });
    expect(events).toHaveLength(1);
    expect(remembered.has(SERVER)).toBe(false);
    expect(noted).toEqual([`${listed.id} on ${SERVER}`]);

    const written = fake.written();
    const secretLines = written.filter((line) => line.includes("private_key"));
    const requests = written.filter((line) => line.includes('"cmd"'));

    expect(secretLines).toHaveLength(2);
    expect(JSON.parse(secretLines[0] ?? "{}")).toMatchObject({
      access_key_id: "AKIA-E2E",
      secret_access_key: "s3-secret",
    });
    expect(requests.join("\n")).not.toContain("s3-secret");
    expect(requests.join("\n")).not.toContain("private_key");
    expect(written.join("\n")).not.toContain(PASSPHRASE);

    agent.closeAll();
  });

  it("asks for the passphrase again when this launch no longer holds the key", async () => {
    const listed = await backup();

    const answer = await restoreData(
      SERVER,
      listed.id,
      ["db-postgres-flyleaf.pupitre"],
      null,
      () => undefined,
      {
        backups: () => Promise.resolve({ ok: true, result: [listed] }),
        derive,
        forget: () => undefined,
        held: () => null,
        noteRestored: () => Promise.resolve(),
        recall: () => null,
        request: () => Promise.resolve({ ok: true, result: {} }),
        sync: () => Promise.resolve(),
      }
    );

    expect(answer).toMatchObject({
      error: { phrase: { values: { kind: "backup" } } },
      ok: false,
    });

    const withBucket = await restoreData(
      SERVER,
      listed.id,
      ["db-postgres-flyleaf.pupitre"],
      null,
      () => undefined,
      {
        backups: () => Promise.resolve({ ok: true, result: [listed] }),
        derive,
        forget: () => undefined,
        held: () => ({
          secret: "s3-secret",
          view: {
            ...STORAGE,
            kdf_salt: listed.kdf_salt,
            recipient: listed.recipient,
          },
        }),
        noteRestored: () => Promise.resolve(),
        recall: () => null,
        request: () => Promise.resolve({ ok: true, result: {} }),
        sync: () => Promise.resolve(),
      }
    );

    expect(withBucket).toMatchObject({
      error: { phrase: { id: "refusal.backup.passphrase.needed" } },
      ok: false,
    });
  });
});
