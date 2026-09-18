import {
  type DeviceFlowPoll,
  type DeviceFlowStart,
  pollDeviceFlow,
  startDeviceFlow,
} from "@pupitre/auth/client/desktop";
import { PUPITRE_ORIGINS } from "@pupitre/shared/legal";
import type { MeSubscription } from "@pupitre/shared/plans";
import type {
  AccountDevice,
  AccountError,
  AccountIdentity,
  AccountResponse,
  BuildKind,
  Entitlement,
} from "@shared/account";
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
export const DEV_AGENT_PLATFORM_URL = "https://dev.pupitre.studio";

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

export interface MeBody {
  user: { email: string; name: string };
  organizations: { id: string; name: string; slug: string; role: string }[];
  active_organization: { id: string; name: string; slug: string } | null;
  role: string | null;
  entitlement: Entitlement;
  subscription?: MeSubscription | null;
}

export interface ServerForUserBody {
  id: string;
  name: string;
  host: string | null;
  port: number;
  user: string;
  host_fingerprint: string | null;
  status: string;
  key_ready: boolean;
  organization: { id: string; name: string };
}

export interface DeviceBody {
  id: string;
  name: string;
  public_key: string;
  fingerprint: string;
}

export interface EnrollInput {
  device_id: string;
  host: string;
  port?: number;
  ssh_user?: string;
  fingerprint?: string;
  probe: { arch: string };
}

export interface EnrollBody {
  server_id: string;
  enrollment_token: string;
  release: {
    version: string;
    url: string;
    sha256: string;
    signature: string;
    channel: string;
  };
}

export interface ReleaseDownload {
  bytes: Uint8Array;
  storage: string;
}

/** What the platform publishes for a version of the agent: enough to name and verify it, not to read it. */
export interface AgentReleaseBody {
  version: string;
  arch: string;
  sha256: string;
  signature: string;
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
  ) => Promise<AccountResponse<EnrollBody>>;
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
  ) => Promise<AccountResponse<AgentReleaseBody>>;
  /**
   * One call per stage of deletion: the first revokes, the second erases the
   * row. Requires the `admin` role; a row already erased answers `not_found`.
   */
  deleteServer: (
    token: string,
    serverId: string
  ) => Promise<AccountResponse<null>>;
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

function identityOf(body: MeBody): AccountIdentity {
  return {
    email: body.user.email,
    entitlement: body.entitlement,
    name: body.user.name,
    organization: body.active_organization,
    organizations: body.organizations,
    role: body.role,
    subscription: body.subscription ?? null,
  };
}

function fleetServerOf(body: ServerForUserBody): FleetServer {
  return {
    host: body.host,
    hostFingerprint: body.host_fingerprint,
    id: body.id,
    keyReady: body.key_ready,
    name: body.name,
    organization: {
      id: body.organization?.id ?? "",
      name: body.organization?.name ?? "",
    },
    port: body.port,
    status: body.status,
    user: body.user,
  };
}

function deviceOf(body: DeviceBody): AccountDevice {
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
    return new URL(`/api/v1${path}`, baseUrl).toString();
  }

  async function call<T>(
    token: string,
    path: string,
    init: RequestInit = {}
  ): Promise<AccountResponse<T>> {
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
      ? { ok: true, result: payload as T }
      : { ok: false, error: failureOf(response.status, payload) };
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
      const answer = await call<MeBody>(token, "/me");

      return answer.ok
        ? { ok: true, result: identityOf(answer.result) }
        : answer;
    },

    async switchOrganization(token, organizationId) {
      const answer = await call<MeBody>(token, "/me", {
        body: JSON.stringify({ organization_id: organizationId }),
        method: "PATCH",
      });

      return answer.ok
        ? { ok: true, result: identityOf(answer.result) }
        : answer;
    },

    async devices(token) {
      const answer = await call<{ data: DeviceBody[] }>(token, "/me/devices");

      return answer.ok
        ? { ok: true, result: answer.result.data.map(deviceOf) }
        : answer;
    },

    removeDevice(token, deviceId) {
      return call<null>(token, `/me/devices/${encodeURIComponent(deviceId)}`, {
        method: "DELETE",
      });
    },

    async addDevice(token, name, publicKey) {
      const answer = await call<{ data: DeviceBody }>(token, "/me/devices", {
        body: JSON.stringify({ name, public_key: publicKey }),
        method: "POST",
      });

      return answer.ok
        ? { ok: true, result: deviceOf(answer.result.data) }
        : answer;
    },

    async servers(token) {
      const answer = await call<{ data: ServerForUserBody[] }>(
        token,
        "/me/servers"
      );

      return answer.ok
        ? { ok: true, result: answer.result.data.map(fleetServerOf) }
        : answer;
    },

    enroll(token, input) {
      return call<EnrollBody>(token, "/servers/enroll", {
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

      return call<AgentReleaseBody>(token, `/releases/agent/latest?${query}`);
    },

    deleteServer(token, serverId) {
      return call<null>(token, `/servers/${encodeURIComponent(serverId)}`, {
        method: "DELETE",
      });
    },
  };
}
