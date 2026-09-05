import type {
  AccountDevice,
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
  enroll: (input: EnrollInput) => Promise<AccountResponse<Enrollment>>;
  releaseBytes: (
    version: string,
    arch: string
  ) => Promise<AccountResponse<Uint8Array>>;
  takeEnrollmentToken: (serverId: string) => string | null;
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
    return { consoleUrl, status: "suspended" };
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

function refusalFor(right: UsageRight): AccountResponse<UsageRight> {
  if (right.status === "granted") {
    return { ok: true, result: right };
  }

  if (right.status === "suspended") {
    return {
      ok: false,
      error: {
        code: "server_suspended",
        message: "Le droit d'usage de cette organisation est suspendu.",
        fix: `Régularise l'abonnement dans la console : ${right.consoleUrl}`,
      },
    };
  }

  if (right.status === "stale") {
    return {
      ok: false,
      error: {
        code: "entitlement_required",
        message:
          "La plateforme n'a pas répondu depuis plus de sept jours : le droit d'usage a expiré.",
        fix: `Reconnecte cet appareil, ou vérifie l'état du compte : ${right.consoleUrl}`,
      },
    };
  }

  return {
    ok: false,
    error: {
      code: "entitlement_required",
      message: "Installer un serveur demande un compte Pupitre.",
      fix: `Connecte-toi depuis les réglages, ou ouvre la console : ${right.consoleUrl}`,
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
            message: "La demande a été refusée dans le navigateur.",
            fix: "Relance la connexion et approuve le code affiché.",
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
        message: "Le code affiché a expiré avant d'être approuvé.",
        fix: "Relance la connexion pour obtenir un nouveau code.",
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
          message: "Cet appareil n'est connecté à aucun compte Pupitre.",
          fix: `Connecte-toi depuis les réglages, ou ouvre la console : ${consoleUrl}`,
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
      return refusalFor(state().usage) as AccountResponse<Enrollment>;
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
      return refusalFor(state().usage) as AccountResponse<Uint8Array>;
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

  return {
    enroll,
    fleet,
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

    takeEnrollmentToken(serverId) {
      const held = enrollmentTokens.get(serverId) ?? null;

      enrollmentTokens.delete(serverId);

      return held;
    },
  };
}
