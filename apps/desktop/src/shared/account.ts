import type { MeSubscription } from "@pupitre/shared/plans";
import type { AccountEntitlement } from "@pupitre/shared/platform-api";
import type { ErrorPhrase } from "./agent";

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
  /** The active one included. */
  organizations: AccountMembership[];
  role: string | null;
  entitlement: Entitlement;
  /** The Stripe mirror of the active organization. */
  subscription: MeSubscription | null;
}

/** Never its key file. */
export interface AccountDevice {
  id: string;
  name: string;
  fingerprint: string;
  publicKey: string;
}

/** The platform says "suspended" also of an organization that never subscribed: the missing mirror tells them apart. */
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
  /** Null: the platform never answered on this computer. */
  checkedAt: string | null;
  usage: UsageRight;
  /** In the words the guard uses on every channel; null while the right is granted. */
  refusal: AccountError | null;
  /** False: the keychain refused the token, which lives for this run only. */
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

export interface EnrollmentSummary {
  serverId: string;
  release: { version: string; channel: string; available: boolean };
}
