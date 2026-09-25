import {
  type DeviceFlowPoll,
  type DeviceFlowStart,
  pollDeviceFlow,
  startDeviceFlow,
} from "@pupitre/auth/client/desktop";
import { PlatformBackupSchema } from "@pupitre/shared/backup";
import type {
  ContractSchema,
  ContractValue,
} from "@pupitre/shared/contracts/json-schema";
import {
  type KeyApprovalSubmission,
  type PendingKeyApproval,
  PendingKeyApprovalSchema,
} from "@pupitre/shared/keys";
import { PUPITRE_ORIGINS } from "@pupitre/shared/legal";
import { PLATFORM_API_PATH } from "@pupitre/shared/platform-api";
import {
  type Device,
  DeviceSchema,
  KeyApprovalReceiptSchema,
  type LatestAgentRelease,
  LatestAgentReleaseSchema,
  listOf,
  type Me,
  MeSchema,
  recordOf,
  type ServerEnrollment,
  ServerEnrollmentSchema,
  type ServerForUser,
  ServerForUserSchema,
} from "@pupitre/shared/platform-api/account";
import type {
  AccountDevice,
  AccountError,
  AccountIdentity,
  AccountResponse,
  BuildKind,
} from "@shared/account";
import type { PlatformBackup } from "@shared/backups";
import type { KeyApprovalReceipt } from "@shared/key-approvals";
import type { FleetServer } from "@shared/servers";

/**
 * The platform, seen from the main process.
 *
 * Nothing here knows Electron, so the whole account can be replayed against the
 * API's own test harness. The bearer token is a parameter of every call and is
 * never held by this module: it belongs to the vault.
 */

export const DEFAULT_PLATFORM_URL = PUPITRE_ORIGINS.app;

/** `bun run dev:web` — the console and its API, on this computer. */
export const LOCAL_PLATFORM_URL = "http://localhost:3000";

/**
 * The same console, as a remote server reaches it.
 *
 * `localhost` means nothing on the VPS: it is that machine's own loopback,
 * where nothing listens. The named tunnel `bun dev` runs publishes this console
 * under this name, which does not change from one launch to the next, and
 * serves only `/api/v1/agent/` of it.
 */
export const DEV_AGENT_PLATFORM_URL = PUPITRE_ORIGINS.devTunnel;

export const RELEASE_STORAGE_HEADER = "x-pupitre-release-storage";

const REDIRECT = 303;

/**
 * How long a call has to come back, and the binary to arrive.
 *
 * A silent platform — one that accepts the connection and never answers — is
 * the case that doesn't show itself: without a bound, the wizard stays stuck
 * on its step announcing nothing. The binary download keeps its own budget,
 * since it needs it.
 */
const CALL_MS = 20_000;
const DOWNLOAD_MS = 5 * 60_000;

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

export interface EnrollInput {
  device_id: string;
  host: string;
  port?: number;
  ssh_user?: string;
  fingerprint?: string;
  probe: { arch: string };
}

export interface ReleaseDownload {
  bytes: Uint8Array;
  storage: string;
}

export interface PlatformClient {
  baseUrl: string;
  deviceCode: () => Promise<AccountResponse<DeviceFlowStart>>;
  deviceToken: (deviceCode: string) => Promise<AccountResponse<DeviceFlowPoll>>;
  me: (token: string) => Promise<AccountResponse<AccountIdentity>>;
  /** Switches this session's active organization, and this session's alone. */
  switchOrganization: (
    token: string,
    organizationId: string
  ) => Promise<AccountResponse<AccountIdentity>>;
  devices: (token: string) => Promise<AccountResponse<AccountDevice[]>>;
  /** Revokes a device: its key stops opening the granted servers at the platform's next push. */
  removeDevice: (
    token: string,
    deviceId: string
  ) => Promise<AccountResponse<null>>;
  addDevice: (
    token: string,
    name: string,
    publicKey: string
  ) => Promise<AccountResponse<AccountDevice>>;
  servers: (token: string) => Promise<AccountResponse<FleetServer[]>>;
  enroll: (
    token: string,
    input: EnrollInput
  ) => Promise<AccountResponse<ServerEnrollment>>;
  downloadRelease: (
    token: string,
    version: string,
    arch: string
  ) => Promise<AccountResponse<ReleaseDownload>>;
  /** The latest version published for this architecture, the one a server should run. */
  latestAgentRelease: (
    token: string,
    arch: string,
    channel?: string
  ) => Promise<AccountResponse<LatestAgentRelease>>;
  /**
   * One call per stage of deletion: the first revokes, the second erases the
   * row. Requires the `admin` role; a row already erased answers `not_found`.
   */
  deleteServer: (
    token: string,
    serverId: string
  ) => Promise<AccountResponse<null>>;
  /** The backups of the active organization, or of one server, the most recent first. */
  backups: (
    token: string,
    serverId?: string
  ) => Promise<AccountResponse<PlatformBackup[]>>;
  /** Notes in the journal that a backup was restored on that server. */
  backupRestored: (
    token: string,
    backupId: string,
    serverId: string
  ) => Promise<AccountResponse<null>>;
  /** The keys servers hold pending that this account may approve. */
  keyApprovals: (
    token: string
  ) => Promise<AccountResponse<PendingKeyApproval[]>>;
  approveKey: (
    token: string,
    approval: KeyApprovalSubmission
  ) => Promise<AccountResponse<KeyApprovalReceipt>>;
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function isLocalPlatform(baseUrl: string): boolean {
  try {
    return LOOPBACK_HOSTS.has(new URL(baseUrl).hostname);
  } catch {
    return false;
  }
}

/**
 * How a build conducts itself, decided by the platform it talks to rather than
 * by the folder it runs from.
 *
 * A development build pointed at a hosted platform is a second computer of the
 * same person: the usage right comes from the account, the agent from the
 * release the platform names, and nothing is granted by the build itself. Only
 * a build on the console of this computer gets the developer's shortcuts.
 */
export function buildKindOf(packaged: boolean, baseUrl: string): BuildKind {
  return packaged || !isLocalPlatform(baseUrl) ? "production" : "development";
}

/**
 * The platform as the agent is given it: its own, unless that is a console of
 * this computer, which no remote server could reach.
 */
export function agentBaseUrl(platform: string): string {
  return isLocalPlatform(platform) ? DEV_AGENT_PLATFORM_URL : platform;
}

/**
 * Which platform a build talks to.
 *
 * A packaged app knows only the hosted one, whatever its environment says: a
 * variable set by anything on the machine must not send the device flow, the
 * bearer token and the enrolment to another address. A development build
 * talks to the console running beside it, or to the one `asked` names — the
 * hosted platform included, which is how a screen is tried against the real
 * account and the real servers without a release.
 */
export function platformUrlOf(
  packaged: boolean,
  asked: string | undefined
): string {
  if (packaged) {
    return DEFAULT_PLATFORM_URL;
  }

  return asked || LOCAL_PLATFORM_URL;
}

/**
 * The API base the agent is given: the app's platform, or in a development
 * build the one `asked` names, when the agent has to answer somewhere else.
 */
export function agentPlatformUrlOf(
  packaged: boolean,
  asked: string | undefined,
  platform: string
): string {
  const base = (!packaged && asked) || platform;

  return new URL(PLATFORM_API_PATH, agentBaseUrl(base)).toString();
}

export function offlineError(error: unknown, baseUrl?: string): AccountError {
  const local = baseUrl ? isLocalPlatform(baseUrl) : false;

  if (!(error instanceof Error)) {
    return {
      code: "offline",
      message: "refusal.platform.unreachable",
      phrase:
        local && baseUrl
          ? { id: "refusal.platform.unreachable.local", values: { baseUrl } }
          : { id: "refusal.platform.unreachable" },
    };
  }

  const reason = error.message;

  return {
    code: "offline",
    message: "refusal.platform.silent",
    phrase:
      local && baseUrl
        ? { id: "refusal.platform.silent.local", values: { reason, baseUrl } }
        : { id: "refusal.platform.silent", values: { reason } },
  };
}

function failureOf(status: number, payload: unknown): AccountError {
  const body = payload as { error?: Partial<AccountError> } | null;
  const carried = body?.error;

  if (carried?.message) {
    return {
      code: carried.code ?? "internal",
      message: carried.message,
      ...(carried.fix ? { fix: carried.fix } : {}),
    };
  }

  return {
    code: status === 401 ? "unauthenticated" : "internal",
    message: "refusal.platform.refused",
    phrase: { id: "refusal.platform.refused", values: { status } },
  };
}

const S3_ERROR_RE = /<Code>([^<]*)<\/Code>(?:.*<Message>([^<]*)<\/Message>)?/s;

/**
 * The storage refuses in S3's XML, never in the console's envelope. Its code
 * and message are what say why — a key of the wrong shape, an expired URL —
 * and the refusal is laid on the storage, not on the account.
 */
async function storageRefusal(
  response: Response,
  version: string
): Promise<AccountError> {
  const body = await response.text().catch(() => "");
  const [, code, message] = S3_ERROR_RE.exec(body) ?? [];
  const detail = [code, message].filter(Boolean).join(": ");

  return {
    code: "release_not_found",
    message: "refusal.release.storage",
    phrase: {
      id: "refusal.release.storage",
      values: { detail, status: response.status, version },
    },
  };
}

/** A contract the app was built against that the platform no longer answers: an app older than the platform. */
function unreadableAnswer(path: string): AccountError {
  return {
    code: "internal",
    message: "refusal.platform.unreadable",
    phrase: { id: "refusal.platform.unreadable", values: { path } },
  };
}

function identityOf(body: Me): AccountIdentity {
  const active = body.active_organization;

  return {
    email: body.user.email,
    entitlement: body.entitlement,
    name: body.user.name,
    organization: active
      ? { id: active.id, name: active.name, slug: active.slug }
      : null,
    organizations: body.organizations.map(({ id, name, slug, role }) => ({
      id,
      name,
      role,
      slug,
    })),
    role: body.role,
    subscription: body.subscription,
  };
}

function fleetServerOf(body: ServerForUser): FleetServer {
  return {
    host: body.host,
    hostFingerprint: body.host_fingerprint,
    id: body.id,
    keyReady: body.key_ready,
    name: body.name,
    organization: body.organization,
    port: body.port,
    status: body.status,
    user: body.user,
  };
}

function deviceOf(body: Device): AccountDevice {
  return {
    fingerprint: body.fingerprint,
    id: body.id,
    name: body.name,
    publicKey: body.public_key,
  };
}

export function createPlatformClient({
  baseUrl,
  fetch: fetchImpl = (input, init) => fetch(input, init),
  timeoutMs = CALL_MS,
  downloadMs = DOWNLOAD_MS,
}: {
  baseUrl: string;
  fetch?: FetchLike;
  timeoutMs?: number;
  downloadMs?: number;
}): PlatformClient {
  function url(path: string): string {
    return new URL(`${PLATFORM_API_PATH}${path}`, baseUrl).toString();
  }

  async function call(
    token: string,
    path: string,
    init: RequestInit = {}
  ): Promise<AccountResponse<unknown>> {
    let response: Response;

    try {
      response = await fetchImpl(url(path), {
        signal: AbortSignal.timeout(timeoutMs),
        ...init,
        headers: {
          accept: "application/json",
          authorization: `Bearer ${token}`,
          ...(init.body ? { "content-type": "application/json" } : {}),
          ...init.headers,
        },
      });
    } catch (error) {
      return { ok: false, error: offlineError(error, baseUrl) };
    }

    const payload = (await response.json().catch(() => null)) as unknown;

    return response.ok
      ? { ok: true, result: payload }
      : { ok: false, error: failureOf(response.status, payload) };
  }

  async function send(
    token: string,
    path: string,
    init: RequestInit
  ): Promise<AccountResponse<null>> {
    const answer = await call(token, path, init);

    return answer.ok ? { ok: true, result: null } : answer;
  }

  async function read<Schema extends ContractSchema>(
    token: string,
    path: string,
    schema: Schema,
    init: RequestInit = {}
  ): Promise<AccountResponse<ContractValue<Schema>>> {
    const answer = await call(token, path, init);

    if (!answer.ok) {
      return answer;
    }

    const parsed = schema.safeParse(answer.result);

    return parsed.success
      ? { ok: true, result: parsed.data }
      : { ok: false, error: unreadableAnswer(path.split("?")[0] ?? path) };
  }

  async function guarded<T>(
    work: () => Promise<AccountResponse<T>>
  ): Promise<AccountResponse<T>> {
    try {
      return await work();
    } catch (error) {
      return { ok: false, error: offlineError(error, baseUrl) };
    }
  }

  async function fetchRelease(
    token: string,
    version: string,
    arch: string
  ): Promise<AccountResponse<ReleaseDownload>> {
    const query = new URLSearchParams({ arch });
    const redirect = await fetchImpl(
      url(`/releases/agent/${encodeURIComponent(version)}?${query.toString()}`),
      {
        headers: { authorization: `Bearer ${token}` },
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      }
    );

    if (redirect.status !== REDIRECT) {
      const payload = (await redirect.json().catch(() => null)) as unknown;

      return { ok: false, error: failureOf(redirect.status, payload) };
    }

    const storage = redirect.headers.get(RELEASE_STORAGE_HEADER) ?? "r2";
    const location = redirect.headers.get("location") ?? "";

    if (storage !== "r2" || !location) {
      return {
        ok: false,
        error: {
          code: "release_not_found",
          message: "refusal.release.unpublished",
          phrase: { id: "refusal.release.unpublished", values: { version } },
        },
      };
    }

    const binary = await fetchImpl(location, {
      signal: AbortSignal.timeout(downloadMs),
    });

    if (!binary.ok) {
      return { ok: false, error: await storageRefusal(binary, version) };
    }

    return {
      ok: true,
      result: {
        bytes: new Uint8Array(await binary.arrayBuffer()),
        storage,
      },
    };
  }

  return {
    baseUrl,

    async deviceCode() {
      try {
        return {
          ok: true,
          result: await startDeviceFlow(baseUrl, { fetch: fetchImpl }),
        };
      } catch (error) {
        return { ok: false, error: offlineError(error, baseUrl) };
      }
    },

    async deviceToken(deviceCode) {
      try {
        return {
          ok: true,
          result: await pollDeviceFlow(baseUrl, deviceCode, {
            fetch: fetchImpl,
          }),
        };
      } catch (error) {
        return { ok: false, error: offlineError(error, baseUrl) };
      }
    },

    async me(token) {
      const answer = await read(token, "/me", MeSchema);

      return answer.ok
        ? { ok: true, result: identityOf(answer.result) }
        : answer;
    },

    async switchOrganization(token, organizationId) {
      const answer = await read(token, "/me", MeSchema, {
        body: JSON.stringify({ organization_id: organizationId }),
        method: "PATCH",
      });

      return answer.ok
        ? { ok: true, result: identityOf(answer.result) }
        : answer;
    },

    async devices(token) {
      const answer = await read(token, "/me/devices", listOf(DeviceSchema));

      return answer.ok
        ? { ok: true, result: answer.result.data.map(deviceOf) }
        : answer;
    },

    removeDevice(token, deviceId) {
      return send(token, `/me/devices/${encodeURIComponent(deviceId)}`, {
        method: "DELETE",
      });
    },

    async addDevice(token, name, publicKey) {
      const answer = await read(token, "/me/devices", recordOf(DeviceSchema), {
        body: JSON.stringify({ name, public_key: publicKey }),
        method: "POST",
      });

      return answer.ok
        ? { ok: true, result: deviceOf(answer.result.data) }
        : answer;
    },

    async servers(token) {
      const answer = await read(
        token,
        "/me/servers",
        listOf(ServerForUserSchema)
      );

      return answer.ok
        ? { ok: true, result: answer.result.data.map(fleetServerOf) }
        : answer;
    },

    enroll(token, input) {
      return read(token, "/servers/enroll", ServerEnrollmentSchema, {
        body: JSON.stringify(input),
        method: "POST",
      });
    },

    downloadRelease(token, version, arch) {
      return guarded(() => fetchRelease(token, version, arch));
    },

    latestAgentRelease(token, arch, channel) {
      const query = new URLSearchParams({ arch });

      if (channel) {
        query.set("channel", channel);
      }

      return read(
        token,
        `/releases/agent/latest?${query}`,
        LatestAgentReleaseSchema
      );
    },

    deleteServer(token, serverId) {
      return send(token, `/servers/${encodeURIComponent(serverId)}`, {
        method: "DELETE",
      });
    },

    async backups(token, serverId) {
      const answer = await read(
        token,
        serverId
          ? `/servers/${encodeURIComponent(serverId)}/backups`
          : "/backups",
        listOf(PlatformBackupSchema)
      );

      return answer.ok ? { ok: true, result: answer.result.data } : answer;
    },

    backupRestored(token, backupId, serverId) {
      return send(token, `/backups/${encodeURIComponent(backupId)}/restored`, {
        body: JSON.stringify({ server_id: serverId }),
        method: "POST",
      });
    },

    async keyApprovals(token) {
      const answer = await read(
        token,
        "/me/key-approvals",
        listOf(PendingKeyApprovalSchema)
      );

      return answer.ok ? { ok: true, result: answer.result.data } : answer;
    },

    async approveKey(token, approval) {
      const answer = await read(
        token,
        "/me/key-approvals",
        recordOf(KeyApprovalReceiptSchema),
        { body: JSON.stringify(approval), method: "POST" }
      );

      return answer.ok ? { ok: true, result: answer.result.data } : answer;
    },
  };
}
