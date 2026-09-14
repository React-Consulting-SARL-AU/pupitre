import type {
  AccountDevice,
  AccountError,
  AccountResponse,
  AccountState,
  BuildKind,
  SignInProgress,
  UsageRight,
} from "@shared/account";
import type { FleetServer } from "@shared/servers";
import type { AccountRecord, TokenVault } from "./account-vault";
import type { EnrollInput, PlatformClient } from "./platform-client";

/**
 * The account, from the code on screen to the right to install.
 *
 * The bearer token is read from the vault at the moment of a call and is never
 * returned, logged or handed to the renderer: what leaves this module is who is
 * signed in and whether Pupitre may work. Seven days without a word from the
 * platform are seven days of work; the eighth is a refusal that says where to
 * go.
 */

const DAY_MS = 86_400_000;

export const TOLERANCE_MS = 7 * DAY_MS;

const FRESH_MS = DAY_MS;

const SLOW_DOWN_MS = 5000;

const SECOND_MS = 1000;

const SPACES = /\s+/;

export interface AccountDeps {
  platform: PlatformClient;
  vault: TokenVault;
  /** The device's own ed25519 public key, in its OpenSSH one-line form. */
  deviceKey: () => Promise<string>;
  deviceName: () => string;
  build: BuildKind;
  now: () => number;
  wait: (ms: number) => Promise<void>;
  openUrl: (url: string) => void;
}

/** What the platform said about a new server. The token stays in this module. */
export interface Enrollment {
  serverId: string;
  release: {
    version: string;
    channel: string;
    url: string;
    sha256: string;
    signature: string;
  };
}

/** A published version of the agent, as the platform names it. */
export interface PublishedAgent {
  version: string;
  arch: string;
  sha256: string;
  signature: string;
}

export interface Account {
  state: () => AccountState;
  signIn: (
    report: (progress: SignInProgress) => void
  ) => Promise<AccountResponse<AccountState>>;
  signOut: () => AccountState;
  refresh: () => Promise<AccountState>;
  guard: () => AccountResponse<UsageRight>;
  /** The servers the platform grants this account, whatever its subscription. */
  fleet: () => Promise<AccountResponse<FleetServer[]>>;
  switchOrganization: (organizationId: string) => Promise<AccountState>;
  enroll: (input: EnrollInput) => Promise<AccountResponse<Enrollment>>;
  releaseBytes: (
    version: string,
    arch: string
  ) => Promise<AccountResponse<Uint8Array>>;
  /** The version the platform publishes for this architecture, the one a server should reach. */
  latestAgentRelease: (
    arch: string
  ) => Promise<AccountResponse<PublishedAgent>>;
  takeEnrollmentToken: (serverId: string) => string | null;
  /**
   * Erase the server from the platform, for good.
   *
   * The platform deletes in two stages — the first call revokes and leaves
   * seven days, the second erases the row — and "remove everywhere" asks for
   * both. A row already gone answers `not_found`, which is the result sought.
   */
  forgetServer: (platformServerId: string) => Promise<AccountResponse<null>>;
  /** The devices the platform holds for this account, this computer among them. */
  devices: () => Promise<AccountResponse<AccountDevice[]>>;
  /**
   * Revokes a device other than this one: its key stops opening the granted
   * servers. This computer's own device is refused here — signing out is the
   * gesture for that, and it says what it costs.
   */
  revokeDevice: (deviceId: string) => Promise<AccountResponse<null>>;
}

function keyBody(line: string): string {
  return line.trim().split(SPACES).slice(0, 2).join(" ");
}

export function consoleUrlOf(baseUrl: string): string {
  return new URL("/dashboard", baseUrl).toString();
}

export function usageRightOf(
  record: AccountRecord,
  {
    build,
    consoleUrl,
    now,
  }: { build: BuildKind; consoleUrl: string; now: number }
): UsageRight {
  const entitlement = record.identity?.entitlement ?? "none";

  if (build === "development" && entitlement !== "suspended") {
    return {
      entitlement,
      source: "development",
      status: "granted",
      validUntil: null,
    };
  }

  if (entitlement === "suspended") {
    return record.identity?.subscription
      ? { consoleUrl, status: "suspended" }
      : { consoleUrl, status: "unsubscribed" };
  }

  if (!record.checkedAt || entitlement === "none") {
    return { consoleUrl, status: "absent" };
  }

  const age = now - Date.parse(record.checkedAt);

  if (age > TOLERANCE_MS) {
    return { consoleUrl, since: record.checkedAt, status: "stale" };
  }

  return {
    entitlement,
    source: age > FRESH_MS ? "cache" : "platform",
    status: "granted",
    validUntil: new Date(
      Date.parse(record.checkedAt) + TOLERANCE_MS
    ).toISOString(),
  };
}

/**
 * Without a token, the device has no session: a granted usage right — the
 * case of a development build — must not pass itself off as a success.
 */
function withoutSession(right: UsageRight): { ok: false; error: AccountError } {
  const refusal = refusalFor(right);

  if (!refusal.ok) {
    return refusal;
  }

  return {
    ok: false,
    error: {
      code: "signed_out",
      message: "refusal.account.signedOut",
      phrase: { id: "refusal.account.signedOut" },
    },
  };
}

function refusalFor(right: UsageRight): AccountResponse<UsageRight> {
  if (right.status === "granted") {
    return { ok: true, result: right };
  }

  if (right.status === "suspended") {
    return {
      ok: false,
      error: {
        code: "server_suspended",
        message: "refusal.account.suspended",
        phrase: {
          id: "refusal.account.suspended",
          values: { console: right.consoleUrl },
        },
      },
    };
  }

  if (right.status === "unsubscribed") {
    return {
      ok: false,
      error: {
        code: "entitlement_required",
        message: "refusal.account.unsubscribed",
        phrase: {
          id: "refusal.account.unsubscribed",
          values: { console: right.consoleUrl },
        },
      },
    };
  }

  if (right.status === "stale") {
    return {
      ok: false,
      error: {
        code: "entitlement_required",
        message: "refusal.account.stale",
        phrase: {
          id: "refusal.account.stale",
          values: { console: right.consoleUrl },
        },
      },
    };
  }

  return {
    ok: false,
    error: {
      code: "entitlement_required",
      message: "refusal.account.required",
      phrase: {
        id: "refusal.account.required",
        values: { console: right.consoleUrl },
      },
    },
  };
}

export function createAccount(deps: AccountDeps): Account {
  const consoleUrl = consoleUrlOf(deps.platform.baseUrl);
  const enrollmentTokens = new Map<string, string>();

  function state(): AccountState {
    const record = deps.vault.record();
    const usage = usageRightOf(record, {
      build: deps.build,
      consoleUrl,
      now: deps.now(),
    });
    const refused = refusalFor(usage);

    return {
      build: deps.build,
      checkedAt: record.checkedAt,
      consoleUrl,
      device: record.device,
      identity: record.identity,
      refusal: refused.ok ? null : refused.error,
      sealed: deps.vault.sealed(),
      usage,
    };
  }

  async function knownDevice(
    token: string,
    publicKey: string
  ): Promise<AccountDevice | null> {
    const listed = await deps.platform.devices(token);

    if (!listed.ok) {
      return null;
    }

    return (
      listed.result.find(
        (device) => keyBody(device.publicKey) === keyBody(publicKey)
      ) ?? null
    );
  }

  async function ensureDevice(
    token: string
  ): Promise<AccountResponse<AccountDevice>> {
    const publicKey = await deps.deviceKey();
    const existing = await knownDevice(token, publicKey);

    if (existing) {
      return { ok: true, result: existing };
    }

    const created = await deps.platform.addDevice(
      token,
      deps.deviceName(),
      publicKey
    );

    if (created.ok || created.error.code !== "device_exists") {
      return created;
    }

    const again = await knownDevice(token, publicKey);

    return again ? { ok: true, result: again } : created;
  }

  async function adopt(token: string): Promise<AccountResponse<AccountState>> {
    const identity = await deps.platform.me(token);

    if (!identity.ok) {
      return identity;
    }

    const device = await ensureDevice(token);

    if (!device.ok) {
      return device;
    }

    deps.vault.keep(token);
    deps.vault.remember({
      checkedAt: new Date(deps.now()).toISOString(),
      device: device.result,
      identity: identity.result,
    });

    return { ok: true, result: state() };
  }

  async function awaitApproval(
    deviceCode: string,
    intervalSeconds: number,
    expiresInSeconds: number
  ): Promise<AccountResponse<string>> {
    let interval = Math.max(intervalSeconds, 1) * SECOND_MS;
    const deadline = deps.now() + expiresInSeconds * SECOND_MS;

    while (deps.now() < deadline) {
      await deps.wait(interval);

      const polled = await deps.platform.deviceToken(deviceCode);

      if (!polled.ok) {
        return polled;
      }

      if (polled.result.status === "authorized") {
        return { ok: true, result: polled.result.token };
      }

      if (polled.result.status === "slow_down") {
        interval += SLOW_DOWN_MS;
      } else if (polled.result.status === "denied") {
        return {
          ok: false,
          error: {
            code: "denied",
            message: "refusal.signIn.denied",
            phrase: { id: "refusal.signIn.denied" },
          },
        };
      } else if (polled.result.status === "expired") {
        break;
      }
    }

    return {
      ok: false,
      error: {
        code: "expired",
        message: "refusal.signIn.expired",
        phrase: { id: "refusal.signIn.expired" },
      },
    };
  }

  async function signIn(
    report: (progress: SignInProgress) => void
  ): Promise<AccountResponse<AccountState>> {
    report({ kind: "starting" });

    const started = await deps.platform.deviceCode();

    if (!started.ok) {
      return started;
    }

    report({
      kind: "code",
      userCode: started.result.user_code,
      verificationUri: started.result.verification_uri,
      verificationUriComplete: started.result.verification_uri_complete,
    });
    deps.openUrl(started.result.verification_uri_complete);
    report({ kind: "waiting" });

    const granted = await awaitApproval(
      started.result.device_code,
      started.result.interval,
      started.result.expires_in
    );

    return granted.ok ? await adopt(granted.result) : granted;
  }

  async function refresh(): Promise<AccountState> {
    const token = deps.vault.token();

    if (!token) {
      return state();
    }

    const identity = await deps.platform.me(token);

    if (identity.ok) {
      deps.vault.remember({
        ...deps.vault.record(),
        checkedAt: new Date(deps.now()).toISOString(),
        identity: identity.result,
      });
    } else if (identity.error.code === "unauthenticated") {
      // The platform said the session is gone: nothing cached may go on
      // vouching for it, seven days or seven minutes.
      deps.vault.clear();
    }

    return state();
  }

  /**
   * `GET /me/servers` asks for a session and nothing else: a member who was
   * given a server sees it before their organization has any subscription of
   * its own, which is exactly the case an invitation creates.
   */
  async function fleet(): Promise<AccountResponse<FleetServer[]>> {
    const token = deps.vault.token();

    if (!token) {
      return {
        ok: false,
        error: {
          code: "unauthenticated",
          message: "refusal.device.none",
          phrase: {
            id: "refusal.device.none.console",
            values: { console: consoleUrl },
          },
        },
      };
    }

    return await deps.platform.servers(token);
  }

  async function enroll(
    input: EnrollInput
  ): Promise<AccountResponse<Enrollment>> {
    const token = deps.vault.token();

    if (!token) {
      return withoutSession(state().usage);
    }

    const enrolled = await deps.platform.enroll(token, input);

    if (!enrolled.ok) {
      return enrolled;
    }

    enrollmentTokens.set(
      enrolled.result.server_id,
      enrolled.result.enrollment_token
    );

    return {
      ok: true,
      result: {
        release: enrolled.result.release,
        serverId: enrolled.result.server_id,
      },
    };
  }

  async function releaseBytes(
    version: string,
    arch: string
  ): Promise<AccountResponse<Uint8Array>> {
    const token = deps.vault.token();

    if (!token) {
      return withoutSession(state().usage);
    }

    const downloaded = await deps.platform.downloadRelease(
      token,
      version,
      arch
    );

    return downloaded.ok
      ? { ok: true, result: downloaded.result.bytes }
      : downloaded;
  }

  function latestAgentRelease(
    arch: string
  ): Promise<AccountResponse<PublishedAgent>> {
    return withToken((token) => deps.platform.latestAgentRelease(token, arch));
  }

  /** The tunnel's three calls need a session, and nothing more: the server already belongs to the account. */
  async function withToken<T>(
    work: (token: string) => Promise<AccountResponse<T>>
  ): Promise<AccountResponse<T>> {
    const token = deps.vault.token();

    if (!token) {
      return withoutSession(state().usage);
    }

    return await work(token);
  }

  /**
   * The active organization, switched from the app.
   *
   * What the platform returns replaces the cached identity: the entitlement and
   * the role are the new organization's, not the old one's, and a refusal
   * leaves the app exactly where it was.
   */
  async function switchOrganization(
    organizationId: string
  ): Promise<AccountState> {
    const token = deps.vault.token();

    if (!token) {
      return state();
    }

    const identity = await deps.platform.switchOrganization(
      token,
      organizationId
    );

    if (identity.ok) {
      deps.vault.remember({
        ...deps.vault.record(),
        checkedAt: new Date(deps.now()).toISOString(),
        identity: identity.result,
      });
    }

    return state();
  }

  return {
    enroll,
    fleet,
    latestAgentRelease,
    switchOrganization,
    refresh,
    releaseBytes,
    signIn,
    state,

    signOut() {
      deps.vault.clear();
      enrollmentTokens.clear();

      return state();
    },

    guard() {
      return refusalFor(state().usage);
    },

    async forgetServer(platformServerId) {
      const revoked = await withToken((token) =>
        deps.platform.deleteServer(token, platformServerId)
      );

      if (!revoked.ok) {
        return revoked.error.code === "not_found"
          ? { ok: true, result: null }
          : revoked;
      }

      const purged = await withToken((token) =>
        deps.platform.deleteServer(token, platformServerId)
      );

      return purged.ok || purged.error.code === "not_found"
        ? { ok: true, result: null }
        : purged;
    },

    takeEnrollmentToken(serverId) {
      const held = enrollmentTokens.get(serverId) ?? null;

      enrollmentTokens.delete(serverId);

      return held;
    },

    devices() {
      return withToken((token) => deps.platform.devices(token));
    },

    revokeDevice(deviceId) {
      if (deviceId === state().device?.id) {
        return Promise.resolve({
          ok: false,
          error: {
            code: "bad_request",
            message: "refusal.device.self",
            phrase: { id: "refusal.device.self" },
          },
        });
      }

      return withToken((token) => deps.platform.removeDevice(token, deviceId));
    },
  };
}
