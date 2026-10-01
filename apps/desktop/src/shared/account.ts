import type { MeLicenseGrant, MeServers } from "@pupitre/shared/plans";
import type { AccountLicense } from "@pupitre/shared/platform-api";
import type { ErrorPhrase } from "./agent";

export type License = AccountLicense;

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
  license: License;
  /** Null without an active organization. */
  servers: MeServers | null;
  /** Null while the organization runs on its free servers alone. */
  licenseGrant: MeLicenseGrant | null;
}

/** Never its key file. */
export interface AccountDevice {
  id: string;
  name: string;
  fingerprint: string;
  publicKey: string;
}

/** The platform says "suspended" also of an organization past its free servers: the server count tells them apart. */
export type UsageRight =
  | {
      status: "granted";
      source: "platform" | "cache" | "development";
      license: License;
      validUntil: string | null;
    }
  | { status: "stale"; since: string; consoleUrl: string }
  | { status: "suspended"; consoleUrl: string }
  | { status: "unlicensed"; servers: MeServers; consoleUrl: string }
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
