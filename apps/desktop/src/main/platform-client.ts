import {
  type DeviceFlowPoll,
  type DeviceFlowStart,
  pollDeviceFlow,
  startDeviceFlow,
} from "@pupitre/auth/client/desktop";
import { PUPITRE_ORIGINS } from "@pupitre/shared/legal";
import type {
  AccountDevice,
  AccountError,
  AccountIdentity,
  AccountResponse,
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
export const DEV_AGENT_PLATFORM_URL = "https://dev-app.pupitre.studio";

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
 * The platform as the agent is given it: its own, unless that is a console of
 * this computer, which no remote server could reach.
 */
export function agentBaseUrl(platform: string): string {
  return isLocalPlatform(platform) ? DEV_AGENT_PLATFORM_URL : platform;
}

export function offlineError(error: unknown, baseUrl?: string): AccountError {
  const reason =
    error instanceof Error ? error.message : "connexion impossible";

  return {
    code: "offline",
    message: "refusal.platform.silent",
    phrase:
      baseUrl && isLocalPlatform(baseUrl)
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

function identityOf(body: MeBody): AccountIdentity {
  return {
    email: body.user.email,
    entitlement: body.entitlement,
    name: body.user.name,
    organization: body.active_organization,
    organizations: body.organizations,
    role: body.role,
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
    const redirect = await fetchImpl(
      url(`/releases/agent/${encodeURIComponent(version)}?arch=${arch}`),
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
      return { ok: false, error: failureOf(binary.status, null) };
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
