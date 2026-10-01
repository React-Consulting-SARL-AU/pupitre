import type {
  KeyApprovalSubmission,
  PendingKeyApproval,
} from "@pupitre/shared/keys";
import { LEGAL_CONTACTS } from "@pupitre/shared/legal";
import { FREE_SERVERS } from "@pupitre/shared/plans";
import type {
  AccountDevice,
  AccountError,
  AccountResponse,
  AccountState,
  BuildKind,
  SignInProgress,
  UsageRight,
} from "@shared/account";
import type { PlatformBackup } from "@shared/backups";
import type { KeyApprovalReceipt } from "@shared/key-approvals";
import type { FleetServer } from "@shared/servers";
import type { AccountRecord, TokenVault } from "./account-vault";
import type { EnrollInput, PlatformClient } from "./platform-client";

const DAY_MS = 86_400_000;

export const TOLERANCE_MS = 7 * DAY_MS;

const FRESH_MS = DAY_MS;

const SLOW_DOWN_MS = 5000;

const SECOND_MS = 1000;

const SPACES = /\s+/;

export interface AccountDeps {
  platform: PlatformClient;
  vault: TokenVault;
  deviceKey: () => Promise<string>;
  deviceName: () => string;
  build: BuildKind;
  now: () => number;
  wait: (ms: number) => Promise<void>;
  openUrl: (url: string) => void;
}

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
  cancelSignIn: () => void;
  signOut: () => AccountState;
  refresh: () => Promise<AccountState>;
  guard: () => AccountResponse<UsageRight>;
  fleet: () => Promise<AccountResponse<FleetServer[]>>;
  switchOrganization: (organizationId: string) => Promise<AccountState>;
  enroll: (input: EnrollInput) => Promise<AccountResponse<Enrollment>>;
  releaseBytes: (
    version: string,
    arch: string
  ) => Promise<AccountResponse<Uint8Array>>;
  latestAgentRelease: (
    arch: string
  ) => Promise<AccountResponse<PublishedAgent>>;
  takeEnrollmentToken: (serverId: string) => string | null;
  /** A failed push keeps the seat bought and the token whole: the next attempt reuses it. */
  heldEnrollment: (serverId: string) => Enrollment | null;
  /** Calls the two-stage delete twice (revoke, then erase); `not_found` is the result sought. */
  forgetServer: (platformServerId: string) => Promise<AccountResponse<null>>;
  devices: () => Promise<AccountResponse<AccountDevice[]>>;
  /** This computer's own device is refused: signing out is the gesture for that, and it says what it costs. */
  revokeDevice: (deviceId: string) => Promise<AccountResponse<null>>;
  backups: (
    platformServerId?: string
  ) => Promise<AccountResponse<PlatformBackup[]>>;
  backupRestored: (
    backupId: string,
    platformServerId: string
  ) => Promise<AccountResponse<null>>;
  keyApprovals: () => Promise<AccountResponse<PendingKeyApproval[]>>;
  approveKey: (
    approval: KeyApprovalSubmission
  ) => Promise<AccountResponse<KeyApprovalReceipt>>;
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
  const license = record.identity?.license ?? "none";

  if (build === "development" && license !== "suspended") {
    return {
      license,
      source: "development",
      status: "granted",
      validUntil: null,
    };
  }

  if (license === "suspended") {
    const servers = record.identity?.servers;

    return servers && servers.used > servers.limit
      ? { consoleUrl, servers, status: "unlicensed" }
      : { consoleUrl, status: "suspended" };
  }

  if (!record.checkedAt || license === "none") {
    return { consoleUrl, status: "absent" };
  }

  const age = now - Date.parse(record.checkedAt);

  if (age > TOLERANCE_MS) {
    return { consoleUrl, since: record.checkedAt, status: "stale" };
  }

  return {
    license,
    source: age > FRESH_MS ? "cache" : "platform",
    status: "granted",
    validUntil: new Date(
      Date.parse(record.checkedAt) + TOLERANCE_MS
    ).toISOString(),
  };
}

/** A development build's granted right must not pass for a session when there is no token. */
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
          values: { support: LEGAL_CONTACTS.support },
        },
      },
    };
  }

  if (right.status === "unlicensed") {
    return {
      ok: false,
      error: {
        code: "license_required",
        message: "refusal.account.unlicensed",
        phrase: {
          id: "refusal.account.unlicensed",
          values: {
            free: FREE_SERVERS,
            support: LEGAL_CONTACTS.support,
            used: right.servers.used,
          },
        },
      },
    };
  }

  if (right.status === "stale") {
    return {
      ok: false,
      error: {
        code: "license_required",
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
      code: "license_required",
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
  const enrollments = new Map<
    string,
    { token: string; enrollment: Enrollment }
  >();

  let attempt = 0;

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

    if (!created.ok && created.error.code === "reauthentication_required") {
      return {
        ok: false,
        error: {
          code: created.error.code,
          message: "refusal.device.reauthenticate",
          phrase: { id: "refusal.device.reauthenticate" },
        },
      };
    }

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
    const own = attempt;
    let interval = Math.max(intervalSeconds, 1) * SECOND_MS;
    const deadline = deps.now() + expiresInSeconds * SECOND_MS;

    while (deps.now() < deadline) {
      await deps.wait(interval);

      if (attempt !== own) {
        return {
          ok: false,
          error: {
            code: "cancelled",
            message: "refusal.signIn.cancelled",
            phrase: { id: "refusal.signIn.cancelled" },
          },
        };
      }

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
      // A revoked session voids the cached grace period too.
      deps.vault.clear();
    }

    return state();
  }

  // No usage-right guard: an invited member sees granted servers before their organization holds a licence.
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

    const enrollment: Enrollment = {
      release: enrolled.result.release,
      serverId: enrolled.result.server_id,
    };

    enrollments.set(enrollment.serverId, {
      enrollment,
      token: enrolled.result.enrollment_token,
    });

    return { ok: true, result: enrollment };
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

  async function withToken<T>(
    work: (token: string) => Promise<AccountResponse<T>>
  ): Promise<AccountResponse<T>> {
    const token = deps.vault.token();

    if (!token) {
      return withoutSession(state().usage);
    }

    return await work(token);
  }

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

    cancelSignIn() {
      attempt += 1;
    },

    signOut() {
      deps.vault.clear();
      enrollments.clear();

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
      const held = enrollments.get(serverId)?.token ?? null;

      enrollments.delete(serverId);

      return held;
    },

    heldEnrollment(serverId) {
      return enrollments.get(serverId)?.enrollment ?? null;
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

    backups(platformServerId) {
      return withToken((token) =>
        deps.platform.backups(token, platformServerId)
      );
    },

    backupRestored(backupId, platformServerId) {
      return withToken((token) =>
        deps.platform.backupRestored(token, backupId, platformServerId)
      );
    },

    keyApprovals() {
      return withToken((token) => deps.platform.keyApprovals(token));
    },

    approveKey(approval) {
      return withToken((token) => deps.platform.approveKey(token, approval));
    },
  };
}
