import type {
  KeyApprovalSubmission,
  PendingKeyApproval,
} from "@pupitre/shared/keys";
import type { MeSubscription } from "@pupitre/shared/plans";
import type {
  AccountDevice,
  AccountError,
  AccountIdentity,
} from "@shared/account";
import type { PlatformBackup } from "@shared/backups";
import type { FleetServer } from "@shared/servers";
import type { Sealer } from "../../account-vault";
import type {
  EnrollBody,
  EnrollInput,
  PlatformClient,
} from "../../platform-client";

/**
 * A platform that answers from memory.
 *
 * It replays the shapes the contract fixes — a device code, a session, a
 * device, an enrolment — so the account can be exercised without a network and
 * without the API's own harness, which the integration test uses instead.
 */

const MASK = 0x5a;

export const FAKE_TOKEN = "session-1a2b3c-secret";

export const FAKE_KEY = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI0000 jordan@mac";

export const IDENTITY: AccountIdentity = {
  email: "ada@pupitre.studio",
  entitlement: "valid",
  name: "Ada",
  organization: { id: "org-1", name: "Ada", slug: "ada" },
  organizations: [{ id: "org-1", name: "Ada", role: "owner", slug: "ada" }],
  role: "owner",
  subscription: null,
};

/** The mirror of a plan that stopped: what tells a suspension from a plan never chosen. */
export const CANCELED_SUBSCRIPTION: MeSubscription = {
  current_period_end: "2026-08-31T00:00:00.000Z",
  servers: { limit: 1, used: 1 },
  status: "canceled",
  trial_ends_at: null,
};

export const DEVICE: AccountDevice = {
  fingerprint: "SHA256:fake",
  id: "device-1",
  name: "MacBook",
  publicKey: FAKE_KEY,
};

export const memorySealer: Sealer = {
  available: () => true,
  decrypt: (value) => Buffer.from(value.map((byte) => byte ^ MASK)).toString(),
  encrypt: (value) =>
    Buffer.from([...Buffer.from(value)].map((byte) => byte ^ MASK)),
};

export interface FakePlatformOptions {
  identity?: AccountIdentity;
  devices?: AccountDevice[];
  polls?: (
    | "authorization_pending"
    | "slow_down"
    | "authorized"
    | "denied"
    | "expired"
  )[];
  release?: EnrollBody["release"];
  latest?: { version: string; sha256: string; signature: string };
  binary?: Uint8Array;
  servers?: FleetServer[];
  backups?: PlatformBackup[];
  keyApprovals?: PendingKeyApproval[];
  /** What `POST /me/devices` answers instead of adding the device. */
  addDeviceRefusal?: AccountError;
}

export interface FakePlatform extends PlatformClient {
  enrolled: EnrollInput[];
  added: { name: string; publicKey: string }[];
  seenTokens: string[];
  switched: string[];
  /** One call per stage of deletion: the first revokes, the second erases. */
  deletions: string[];
  /** The devices revoked, in order. */
  revokedDevices: string[];
  /** The restorations noted, as `<backup> on <server>`. */
  restored: string[];
  /** The approvals submitted, as sent. */
  approvals: KeyApprovalSubmission[];
}

const READY_RELEASE: EnrollBody["release"] = {
  channel: "stable",
  sha256: "",
  signature: "",
  url: "",
  version: "0.0.0-dev",
};

export function fakePlatform(options: FakePlatformOptions = {}): FakePlatform {
  const polls = [...(options.polls ?? ["authorized"])];
  const devices = [...(options.devices ?? [])];
  const enrolled: EnrollInput[] = [];
  const added: { name: string; publicKey: string }[] = [];
  const seenTokens: string[] = [];
  const switched: string[] = [];
  const deletions: string[] = [];
  const revokedDevices: string[] = [];
  const restored: string[] = [];
  const approvals: KeyApprovalSubmission[] = [];

  function seen<T>(token: string, result: T) {
    seenTokens.push(token);

    return { ok: true as const, result };
  }

  return {
    added,
    approvals,
    baseUrl: "https://app.pupitre.test",
    deletions,
    enrolled,
    restored,
    revokedDevices,
    seenTokens,
    switched,

    backups: (token, serverId) =>
      Promise.resolve(
        seen(
          token,
          (options.backups ?? []).filter(
            (backup) => !serverId || backup.server_id === serverId
          )
        )
      ),

    backupRestored: (token, backupId, serverId) => {
      restored.push(`${backupId} on ${serverId}`);

      return Promise.resolve(seen(token, null));
    },

    deviceCode: () =>
      Promise.resolve({
        ok: true,
        result: {
          device_code: "device-code",
          expires_in: 600,
          interval: 1,
          user_code: "WDJB-MJHT",
          verification_uri: "https://app.pupitre.test/auth/device",
          verification_uri_complete:
            "https://app.pupitre.test/auth/device?user_code=WDJB-MJHT",
        },
      }),

    deviceToken: () => {
      const status = polls.shift() ?? "authorized";

      return Promise.resolve({
        ok: true,
        result:
          status === "authorized"
            ? { expires_in: 3600, status, token: FAKE_TOKEN }
            : { status },
      });
    },

    me: (token) => Promise.resolve(seen(token, options.identity ?? IDENTITY)),

    switchOrganization: (token, organizationId) => {
      switched.push(organizationId);

      const identity = options.identity ?? IDENTITY;
      const wanted =
        identity.organizations.find(
          (organization) => organization.id === organizationId
        ) ?? null;

      return Promise.resolve(
        seen(token, {
          ...identity,
          organization: wanted
            ? { id: wanted.id, name: wanted.name, slug: wanted.slug }
            : identity.organization,
          role: wanted?.role ?? identity.role,
        })
      );
    },

    devices: (token) => Promise.resolve(seen(token, devices)),

    removeDevice: (token, deviceId) => {
      const at = devices.findIndex((device) => device.id === deviceId);

      if (at === -1) {
        seenTokens.push(token);

        return Promise.resolve({
          error: { code: "not_found", message: "device_not_found" },
          ok: false as const,
        });
      }

      devices.splice(at, 1);
      revokedDevices.push(deviceId);

      return Promise.resolve(seen(token, null));
    },

    servers: (token) => Promise.resolve(seen(token, options.servers ?? [])),

    addDevice: (token, name, publicKey) => {
      if (options.addDeviceRefusal) {
        seenTokens.push(token);

        return Promise.resolve({
          error: options.addDeviceRefusal,
          ok: false as const,
        });
      }

      added.push({ name, publicKey });
      devices.push({ ...DEVICE, name, publicKey });

      return Promise.resolve(seen(token, devices.at(-1) as AccountDevice));
    },

    enroll: (token, input) => {
      enrolled.push(input);

      return Promise.resolve(
        seen(token, {
          enrollment_token: "enrol-secret",
          release: options.release ?? READY_RELEASE,
          server_id: `srv-platform-${enrolled.length}`,
        })
      );
    },

    deleteServer: (token, serverId) => {
      deletions.push(serverId);

      return Promise.resolve(seen(token, null));
    },

    downloadRelease: (token) =>
      Promise.resolve(
        seen(token, {
          bytes: options.binary ?? new Uint8Array([1, 2, 3]),
          storage: "r2",
        })
      ),

    latestAgentRelease: (token, arch) =>
      Promise.resolve(
        seen(token, {
          arch,
          sha256: options.latest?.sha256 ?? "",
          signature: options.latest?.signature ?? "",
          version: options.latest?.version ?? "0.0.0-dev",
        })
      ),

    keyApprovals: (token) =>
      Promise.resolve(seen(token, options.keyApprovals ?? [])),

    approveKey: (token, approval) => {
      approvals.push(approval);

      return Promise.resolve(
        seen(token, {
          device_id: approval.device_id,
          issued_at: approval.issued_at,
          server_id: approval.server_id,
          signer: approval.signer,
        })
      );
    },
  };
}
