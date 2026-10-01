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

export const DEFAULT_PLATFORM_URL = PUPITRE_ORIGINS.app;

export const LOCAL_PLATFORM_URL = "http://localhost:3000";

/** A VPS cannot reach this computer's localhost: `bun dev` publishes the console under this tunnel name. */
export const DEV_AGENT_PLATFORM_URL = PUPITRE_ORIGINS.devTunnel;

export const RELEASE_STORAGE_HEADER = "x-pupitre-release-storage";

const REDIRECT = 303;

/** A platform that accepts the connection and never answers would otherwise leave the wizard stuck silently. */
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
  switchOrganization: (
    token: string,
    organizationId: string
  ) => Promise<AccountResponse<AccountIdentity>>;
  devices: (token: string) => Promise<AccountResponse<AccountDevice[]>>;
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
  latestAgentRelease: (
    token: string,
    arch: string,
    channel?: string
  ) => Promise<AccountResponse<LatestAgentRelease>>;
  /** Two-stage: the first call revokes, the second erases the row; an erased row answers `not_found`. */
  deleteServer: (
    token: string,
    serverId: string
  ) => Promise<AccountResponse<null>>;
  backups: (
    token: string,
    serverId?: string
  ) => Promise<AccountResponse<PlatformBackup[]>>;
  backupRestored: (
    token: string,
    backupId: string,
    serverId: string
  ) => Promise<AccountResponse<null>>;
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

/** A dev build on a hosted platform behaves as production: only a local console grants developer shortcuts. */
export function buildKindOf(packaged: boolean, baseUrl: string): BuildKind {
  return packaged || !isLocalPlatform(baseUrl) ? "production" : "development";
}

export function agentBaseUrl(platform: string): string {
  return isLocalPlatform(platform) ? DEV_AGENT_PLATFORM_URL : platform;
}

/** A packaged app ignores its environment: no variable may redirect the bearer token to another address. */
export function platformUrlOf(
  packaged: boolean,
  asked: string | undefined
): string {
  if (packaged) {
    return DEFAULT_PLATFORM_URL;
  }

  return asked || LOCAL_PLATFORM_URL;
}

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

const CONSENT_PATH = "/auth/consent";

// The consent is given in the console: the app names that page itself, in its own language.
function consentRequired(message: string, baseUrl: string): AccountError {
  return {
    code: "consent_required",
    message,
    phrase: {
      id: "refusal.account.consent",
      values: { console: new URL(CONSENT_PATH, baseUrl).toString() },
    },
  };
}

function failureOf(
  status: number,
  payload: unknown,
  baseUrl: string
): AccountError {
  const body = payload as { error?: Partial<AccountError> } | null;
  const carried = body?.error;

  if (carried?.code === "consent_required") {
    return consentRequired(carried.message ?? "", baseUrl);
  }

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

/** The storage refuses in S3's XML, never in the console's envelope. */
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

/** An answer off the contract means an app older than the platform. */
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
    license: body.license,
    licenseGrant: body.license_grant,
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
    servers: body.servers,
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
      : { ok: false, error: failureOf(response.status, payload, baseUrl) };
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

      return {
        ok: false,
        error: failureOf(redirect.status, payload, baseUrl),
      };
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
