import type { MeSubscription } from "@pupitre/shared/plans";
import type { AccountEntitlement } from "@pupitre/shared/platform-api";
import type { ErrorPhrase } from "./agent";
/**
 * What the two processes say to each other about the account.
 *
 * The bearer token is not in here, and that is the point: it is written by the
 * main process into the operating system's keychain and read back there. What
 * crosses the bridge is who is signed in, which device this computer is, and
 * whether the usage right still stands.
 */

export type Entitlement = AccountEntitlement;

export type BuildKind = "development" | "production";

export interface AccountError {
  code: string;
  message: string;
  fix?: string;
  phrase?: ErrorPhrase;
}

export type AccountResponse<T> =
  | { ok: true; result: T }
  | { ok: false; error: AccountError };

export interface AccountOrganization {
  id: string;
  name: string;
  slug: string;
}

export interface AccountMembership extends AccountOrganization {
  role: string;
}

export interface AccountIdentity {
  email: string;
  name: string;
  organization: AccountOrganization | null;
  /** Every organization this account belongs to, the active one included. */
  organizations: AccountMembership[];
  role: string | null;
  entitlement: Entitlement;
  /** The Stripe mirror of the active organization; null without one. */
  subscription: MeSubscription | null;
}

/** The device this computer is, as the platform knows it. Never its key file. */
export interface AccountDevice {
  id: string;
  name: string;
  fingerprint: string;
  publicKey: string;
}

/**
 * Whether Pupitre may work, and on whose word.
 *
 * "platform" is a fresh answer, "cache" one that still holds within the seven
 * days the app is allowed to go without the platform, "development" the right a
 * development build carries on its own. The platform says "suspended" of an
 * organization that never subscribed as well as of one whose subscription
 * stopped; "unsubscribed" is the first, told apart by the missing mirror.
 */
export type UsageRight =
  | {
      status: "granted";
      source: "platform" | "cache" | "development";
      entitlement: Entitlement;
      validUntil: string | null;
    }
  | { status: "stale"; since: string; consoleUrl: string }
  | { status: "suspended"; consoleUrl: string }
  | { status: "unsubscribed"; consoleUrl: string }
  | { status: "absent"; consoleUrl: string };

export interface AccountState {
  build: BuildKind;
  consoleUrl: string;
  identity: AccountIdentity | null;
  device: AccountDevice | null;
  /** When the platform last answered. Null: it never did on this computer. */
  checkedAt: string | null;
  usage: UsageRight;
  /**
   * Why Pupitre refuses to work, in the words the guard uses on every channel.
   * Null while the right is granted.
   */
  refusal: AccountError | null;
  /** Whether the keychain took the token. False: it lives for this run only. */
  sealed: boolean;
}

export type SignInProgress =
  | { kind: "starting" }
  | {
      kind: "code";
      userCode: string;
      verificationUri: string;
      verificationUriComplete: string;
    }
  | { kind: "waiting" };

/** What the platform said about a freshly enrolled server. No token in sight. */
export interface EnrollmentSummary {
  serverId: string;
  release: { version: string; channel: string; available: boolean };
}
