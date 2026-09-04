import {
  type DeviceFlowPoll,
  type DeviceFlowStart,
  pollDeviceFlow,
  startDeviceFlow,
} from "@pupitre/auth/client/desktop";
import type {
  AccountDevice,
  AccountError,
  AccountIdentity,
  AccountResponse,
  Entitlement,
} from "@shared/account";

/**
 * The platform, seen from the main process.
 *
 * Nothing here knows Electron, so the whole account can be replayed against the
 * API's own test harness. The bearer token is a parameter of every call and is
 * never held by this module: it belongs to the vault.
 */

export const DEFAULT_PLATFORM_URL = "https://app.pupitre.studio";

export const RELEASE_STORAGE_HEADER = "x-pupitre-release-storage";

const REDIRECT = 303;

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

export interface MeBody {
  user: { email: string; name: string };
  active_organization: { id: string; name: string; slug: string } | null;
  role: string | null;
  entitlement: Entitlement;
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

export interface PlatformClient {
  baseUrl: string;
  deviceCode: () => Promise<AccountResponse<DeviceFlowStart>>;
  deviceToken: (deviceCode: string) => Promise<AccountResponse<DeviceFlowPoll>>;
  me: (token: string) => Promise<AccountResponse<AccountIdentity>>;
  devices: (token: string) => Promise<AccountResponse<AccountDevice[]>>;
  addDevice: (
    token: string,
    name: string,
    publicKey: string
  ) => Promise<AccountResponse<AccountDevice>>;
  enroll: (
    token: string,
    input: EnrollInput
  ) => Promise<AccountResponse<EnrollBody>>;
  downloadRelease: (
    token: string,
    version: string,
    arch: string
  ) => Promise<AccountResponse<ReleaseDownload>>;
}

export function offlineError(error: unknown): AccountError {
  const reason =
    error instanceof Error ? error.message : "connexion impossible";

  return {
    code: "offline",
    message: `La plateforme n'a pas répondu : ${reason}.`,
    fix: "Vérifie ta connexion. Pupitre reste utilisable sept jours sans la plateforme.",
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
    message: `La plateforme a refusé la demande (${status}).`,
    fix: "Reconnecte-toi depuis les réglages, puis réessaie.",
  };
}

function identityOf(body: MeBody): AccountIdentity {
  return {
    email: body.user.email,
    entitlement: body.entitlement,
    name: body.user.name,
    organization: body.active_organization,
    role: body.role,
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
}: {
  baseUrl: string;
  fetch?: FetchLike;
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
        ...init,
        headers: {
          accept: "application/json",
          authorization: `Bearer ${token}`,
          ...(init.body ? { "content-type": "application/json" } : {}),
          ...init.headers,
        },
      });
    } catch (error) {
      return { ok: false, error: offlineError(error) };
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
      return { ok: false, error: offlineError(error) };
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
          message: `La plateforme n'a pas de binaire téléchargeable pour ${version}.`,
          fix: "Publie une version de l'agent, ou reste sur un build de développement.",
        },
      };
    }

    const binary = await fetchImpl(location);

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
        return { ok: false, error: offlineError(error) };
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
        return { ok: false, error: offlineError(error) };
      }
    },

    async me(token) {
      const answer = await call<MeBody>(token, "/me");

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

    enroll(token, input) {
      return call<EnrollBody>(token, "/servers/enroll", {
        body: JSON.stringify(input),
        method: "POST",
      });
    },

    downloadRelease(token, version, arch) {
      return guarded(() => fetchRelease(token, version, arch));
    },
  };
}
