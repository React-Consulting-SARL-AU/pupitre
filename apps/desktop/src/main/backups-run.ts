import type {
  BackupRestoreDataResult,
  BackupRestoreSetupResult,
  BackupRunResult,
  BackupSecrets,
} from "@pupitre/shared/agent-protocol/backup";
import type { Event } from "@pupitre/shared/agent-protocol/envelope";
import type { InstallSecrets } from "@pupitre/shared/agent-protocol/install";
import {
  BACKUP_MODULE_ID,
  type BackupLocation,
  BackupRecipientSchema,
  BackupSaltSchema,
} from "@pupitre/shared/backup";
import type { AgentResponse } from "@shared/agent";
import {
  BACKUP_PASSPHRASE_MIN,
  type BackupConnectionInput,
  type BackupConnectionView,
  type BackupStorage,
  backupStorageProblems,
  type OrganizationIdentity,
  type PlatformBackup,
  type RestoreSetupOptions,
  type RestoreUpdate,
} from "@shared/backups";
import type { CallOptions } from "./agent-client";
import { refuseWith } from "./refusal";
import type { ManagedValues } from "./tunnel-run";

/**
 * Backups, seen from the laptop: the bucket it hands the servers, the key they
 * encrypt to, and the restore that needs the passphrase back.
 *
 * The passphrase arrives, is derived here and dropped with the call: nothing
 * of it is written, and only the public key and its salt are kept. The private
 * key a restore derives is held in memory between the configuration and the
 * data — the install and the hardening run in between, and asking the reader
 * twice would be asking them to type a secret for the app's convenience — and
 * is zeroed once the data is back or the restore abandoned.
 */

/** What the keychain holds for the bucket: the settings beside it, and the secret access key. */
export interface HeldBackup {
  view: BackupConnectionView;
  secret: string;
}

export interface DerivedIdentity {
  privateKey: Buffer;
  recipient: string;
}

export interface ConnectDeps {
  held: () => HeldBackup | null;
  keep: (view: BackupConnectionView, secret: string) => void;
  /** The identity of the organization's most recent backup, from the platform. */
  identity: () => Promise<AgentResponse<OrganizationIdentity | null>>;
  derive: (passphrase: string, salt: string) => Promise<DerivedIdentity>;
  drawSalt: () => string;
  normalize: (passphrase: string) => string;
  /** A signed write then delete in the bucket: nothing is kept that the servers could not use. */
  probe: (
    storage: BackupStorage,
    secret: string
  ) => Promise<AgentResponse<null>>;
}

const STORAGE_KEYS: readonly (keyof BackupStorage)[] = [
  "endpoint",
  "region",
  "bucket",
  "prefix",
  "access_key_id",
];

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** The settings a record kept, when they still have the shape this app writes. */
export function backupViewOf(
  settings: Record<string, unknown> | null
): BackupConnectionView | null {
  if (!settings || typeof settings.path_style !== "boolean") {
    return null;
  }

  const recipient = BackupRecipientSchema.safeParse(settings.recipient);
  const salt = BackupSaltSchema.safeParse(settings.kdf_salt);

  if (!(recipient.success && salt.success)) {
    return null;
  }

  const fields = STORAGE_KEYS.map((key) => [key, text(settings[key])]);

  if (fields.some(([, value]) => value === null)) {
    return null;
  }

  return {
    ...(Object.fromEntries(fields) as Omit<BackupStorage, "path_style">),
    kdf_salt: salt.data,
    path_style: settings.path_style,
    recipient: recipient.data,
  };
}

/** The shape of what the form sent, before its values are weighed. */
export function checkedConnectionInput(
  raw: unknown
): BackupConnectionInput | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }

  const given = raw as Record<string, unknown>;
  const fields = STORAGE_KEYS.map((key) => [key, text(given[key])]);

  if (
    fields.some(([, value]) => value === null) ||
    typeof given.path_style !== "boolean"
  ) {
    return null;
  }

  const secret = text(given.secret_access_key);
  const passphrase = text(given.passphrase);

  return {
    ...(Object.fromEntries(
      fields.map(([key, value]) => [key, (value as string).trim()])
    ) as Omit<BackupStorage, "path_style">),
    path_style: given.path_style,
    ...(secret?.trim() ? { secret_access_key: secret.trim() } : {}),
    ...(passphrase?.trim() ? { passphrase } : {}),
  };
}

/**
 * The identity the connection will hold: a new passphrase draws a new salt,
 * none keeps the one already held, and a first connection without one takes
 * the organization's — a second computer must not need the passphrase to
 * configure, only to restore.
 */
async function identityOf(
  input: BackupConnectionInput,
  deps: ConnectDeps
): Promise<AgentResponse<{ recipient: string; kdf_salt: string }>> {
  if (input.passphrase !== undefined) {
    if (deps.normalize(input.passphrase).length < BACKUP_PASSPHRASE_MIN) {
      return refuseWith("bad_request", "refusal.backup.passphrase.short", {
        min: BACKUP_PASSPHRASE_MIN,
      });
    }

    const salt = deps.drawSalt();
    const derived = await deps.derive(input.passphrase, salt);

    derived.privateKey.fill(0);

    return {
      ok: true,
      result: { kdf_salt: salt, recipient: derived.recipient },
    };
  }

  const held = deps.held();

  if (held) {
    return {
      ok: true,
      result: { kdf_salt: held.view.kdf_salt, recipient: held.view.recipient },
    };
  }

  const adopted = await deps.identity();

  if (!adopted.ok) {
    return adopted;
  }

  return adopted.result
    ? {
        ok: true,
        result: {
          kdf_salt: adopted.result.kdf_salt,
          recipient: adopted.result.recipient,
        },
      }
    : refuseWith("bad_request", "refusal.backup.passphrase.none");
}

export async function connectBackup(
  raw: unknown,
  deps: ConnectDeps
): Promise<AgentResponse<BackupConnectionView>> {
  const input = checkedConnectionInput(raw);

  if (!input) {
    return refuseWith("bad_request", "refusal.params.invalid", {
      cmd: "backup:connect",
    });
  }

  const [field] = Object.keys(backupStorageProblems(input));

  if (field) {
    return refuseWith("bad_request", "refusal.backup.field", { field });
  }

  const secret = input.secret_access_key ?? deps.held()?.secret;

  if (!secret) {
    return refuseWith("bad_request", "refusal.backup.secret.none");
  }

  const probed = await deps.probe(input, secret);

  if (!probed.ok) {
    return probed;
  }

  const identity = await identityOf(input, deps);

  if (!identity.ok) {
    return identity;
  }

  const view: BackupConnectionView = {
    access_key_id: input.access_key_id,
    bucket: input.bucket,
    endpoint: input.endpoint,
    path_style: input.path_style,
    prefix: input.prefix,
    region: input.region,
    ...identity.result,
  };

  deps.keep(view, secret);

  return { ok: true, result: view };
}

/** The most recent backup of the organization names the identity every computer of it encrypts to. */
export function latestIdentity(
  backups: readonly PlatformBackup[]
): OrganizationIdentity | null {
  const latest = [...backups].sort((a, b) =>
    b.created_at.localeCompare(a.created_at)
  )[0];

  return latest
    ? {
        created_at: latest.created_at,
        kdf_salt: latest.kdf_salt,
        recipient: latest.recipient,
        server_name: latest.server_name,
      }
    : null;
}

/**
 * What `core.backup` takes from the connection at install: every managed field
 * but the secret key in the configuration, the secret key on the secret line.
 */
export function backupManaged(
  modules: readonly string[],
  held: HeldBackup | null,
  lenient: boolean
): AgentResponse<ManagedValues> {
  if (!modules.includes(BACKUP_MODULE_ID)) {
    return { ok: true, result: { config: {}, secrets: {} } };
  }

  if (!held) {
    return lenient
      ? { ok: true, result: { config: {}, secrets: {} } }
      : refuseWith("bad_request", "refusal.connection.absent", {
          kind: "backup",
        });
  }

  const secrets: InstallSecrets = {
    [BACKUP_MODULE_ID]: { secret_access_key: held.secret },
  };

  return {
    ok: true,
    result: { config: { [BACKUP_MODULE_ID]: { ...held.view } }, secrets },
  };
}

export function locationOf(backup: PlatformBackup): BackupLocation {
  return {
    bucket: backup.location.bucket,
    endpoint: backup.location.endpoint,
    key: backup.location.key,
    path_style: backup.location.path_style,
    region: backup.location.region,
    sha256: backup.location.sha256,
  };
}

/** A backup unlocked by its passphrase: the key goes to the agent, and nowhere else. */
export interface Unlocked {
  backup: PlatformBackup;
  privateKey: Buffer;
}

type Request = (
  serverId: string,
  cmd: "backup.run" | "backup.restore.setup" | "backup.restore.data",
  params: unknown,
  options: CallOptions
) => Promise<AgentResponse<unknown>>;

export interface RestoreDeps {
  held: () => HeldBackup | null;
  /** The backups of the organization, from the platform: the one named carries its location and identity. */
  backups: () => Promise<AgentResponse<PlatformBackup[]>>;
  derive: (passphrase: string, salt: string) => Promise<DerivedIdentity>;
  request: Request;
}

/**
 * The passphrase, checked on this computer against the backup's own public
 * key before anything leaves: a wrong one is refused here, and the machine is
 * never asked to try it.
 */
export async function unlockBackup(
  backupId: string,
  passphrase: string,
  deps: Pick<RestoreDeps, "backups" | "derive">
): Promise<AgentResponse<Unlocked>> {
  const listed = await deps.backups();

  if (!listed.ok) {
    return listed;
  }

  const backup = listed.result.find((one) => one.id === backupId);

  if (!backup) {
    return refuseWith("bad_request", "refusal.backup.unknown", {
      id: backupId,
    });
  }

  const derived = await deps.derive(passphrase, backup.kdf_salt);

  if (derived.recipient !== backup.recipient) {
    derived.privateKey.fill(0);

    return refuseWith("bad_request", "refusal.backup.passphrase.wrong");
  }

  return { ok: true, result: { backup, privateKey: derived.privateKey } };
}

function secretsOf(held: HeldBackup, privateKey: Buffer): BackupSecrets {
  return {
    access_key_id: held.view.access_key_id,
    private_key: privateKey.toString("base64"),
    secret_access_key: held.secret,
  };
}

function absentConnection(): AgentResponse<never> {
  return refuseWith("bad_request", "refusal.connection.absent", {
    kind: "backup",
  });
}

export interface SetupDeps extends RestoreDeps {
  remember: (serverId: string, unlocked: Unlocked) => void;
}

/**
 * The configuration of a backup, put on a machine.
 *
 * A revert may first save the machine as it stands — what lets a reader go
 * back on going back. That save runs only once the passphrase is known good:
 * a typing mistake must not cost a backup of several minutes.
 */
export async function restoreSetup(
  serverId: string,
  backupId: string,
  passphrase: string,
  options: RestoreSetupOptions,
  update: (change: RestoreUpdate) => void,
  deps: SetupDeps
): Promise<AgentResponse<BackupRestoreSetupResult>> {
  const held = deps.held();

  if (!held) {
    return absentConnection();
  }

  const unlocked = await unlockBackup(backupId, passphrase, deps);

  if (!unlocked.ok) {
    return unlocked;
  }

  const { backup, privateKey } = unlocked.result;
  const onEvent = (event: Event) => update({ event, kind: "event" });

  if (options.saveFirst) {
    update({ kind: "phase", phase: "save" });

    const saved = (await deps.request(
      serverId,
      "backup.run",
      {},
      { onEvent }
    )) as AgentResponse<BackupRunResult>;

    if (!saved.ok) {
      privateKey.fill(0);

      return saved;
    }
  }

  update({ kind: "phase", phase: "setup" });

  const answer = (await deps.request(
    serverId,
    "backup.restore.setup",
    {
      location: locationOf(backup),
      ...(options.revert ? { revert: true } : {}),
      secrets_stdin: true,
    },
    { onEvent, secrets: secretsOf(held, privateKey) }
  )) as AgentResponse<BackupRestoreSetupResult>;

  if (answer.ok) {
    deps.remember(serverId, unlocked.result);
  } else {
    privateKey.fill(0);
  }

  return answer;
}

export interface DataDeps extends RestoreDeps {
  recall: (serverId: string) => Unlocked | null;
  forget: (serverId: string) => void;
  /** The console learns what the machine now runs; a silence costs a stale console, nothing else. */
  sync: (serverId: string) => Promise<unknown>;
  noteRestored: (backupId: string, serverId: string) => Promise<unknown>;
}

/**
 * The data of a backup, brought back once its modules stand.
 *
 * The key held since the configuration is used when it is this backup's; a
 * relaunched app holds none, and asks the passphrase again rather than going
 * on without it.
 */
export async function restoreData(
  serverId: string,
  backupId: string,
  parts: readonly string[],
  passphrase: string | null,
  onEvent: (event: Event) => void,
  deps: DataDeps
): Promise<AgentResponse<BackupRestoreDataResult>> {
  const held = deps.held();

  if (!held) {
    return absentConnection();
  }

  if (parts.length === 0) {
    return refuseWith("bad_request", "refusal.backup.parts.none");
  }

  const recalled = deps.recall(serverId);
  let unlocked: Unlocked;

  if (recalled?.backup.id === backupId) {
    unlocked = recalled;
  } else if (passphrase) {
    const answer = await unlockBackup(backupId, passphrase, deps);

    if (!answer.ok) {
      return answer;
    }

    unlocked = answer.result;
  } else {
    return refuseWith("bad_request", "refusal.backup.passphrase.needed");
  }

  const answer = (await deps.request(
    serverId,
    "backup.restore.data",
    {
      location: locationOf(unlocked.backup),
      parts: [...parts],
      secrets_stdin: true,
    },
    { onEvent, secrets: secretsOf(held, unlocked.privateKey) }
  )) as AgentResponse<BackupRestoreDataResult>;

  if (unlocked !== recalled) {
    unlocked.privateKey.fill(0);
  }

  if (!answer.ok) {
    return answer;
  }

  deps.forget(serverId);

  await deps.sync(serverId).catch(() => undefined);
  await deps.noteRestored(backupId, serverId).catch(() => undefined);

  return answer;
}
