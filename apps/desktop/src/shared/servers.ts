import type { ErrorPhrase } from "./agent";

/** "system": the host is a block of the user's own ~/.ssh/config, and the app writes nothing for it. */
export type ServerOrigin = "app" | "system";

export interface Server {
  id: string;
  name: string;
  /** An address for an app server, a ~/.ssh/config alias for a system one. */
  host: string;
  port: number;
  /** Empty on a system host: its own block says which account. */
  user: string;
  origin: ServerOrigin;
  /** Absent on a system host, its own alias, and on a server that answers to `pupitre-<id>` alone. */
  slug?: string;
  /** Absent on a system host. */
  keyPath?: string;
  /** Absent until the first contact. */
  hostFingerprint?: string;
  grant?: ServerGrant;
}

export interface FleetServer {
  id: string;
  name: string;
  /** Null until the platform knows where the machine answers. */
  host: string | null;
  port: number;
  user: string;
  hostFingerprint: string | null;
  /** `enrolling`, `active`, `grace`, `suspended`, `revoked` — the platform's word. */
  status: string;
  /** Whether the platform holds a key of this account to push on the servers. */
  keyReady: boolean;
  organization: ServerOrganization;
}

export interface ServerOrganization {
  id: string;
  name: string;
}

export interface ServerGrant {
  id: string;
  status: string;
  keyReady: boolean;
  /** Absent from an earlier version of the file. */
  organization?: ServerOrganization;
  listed: boolean;
  /** Created from the platform's list rather than typed here. */
  adopted: boolean;
  opened: boolean;
}

/** A suspended server is not gone: a licence comes back, and the entry has to survive the wait. */
export function grantGone(grant: ServerGrant): boolean {
  return !grant.listed || grant.status === "revoked";
}

export function grantWithdrawn(grant: ServerGrant): boolean {
  return grantGone(grant) || grant.status === "suspended";
}

export function grantPending(grant: ServerGrant): boolean {
  return (
    !grantWithdrawn(grant) && (!grant.keyReady || grant.status === "enrolling")
  );
}

export function grantOpens(grant: ServerGrant): boolean {
  return !(grantWithdrawn(grant) || grantPending(grant));
}

export interface FleetView {
  granted: FleetServer[];
  config: ServersConfig;
  /** Local identifiers, not the platform's. */
  adopted: string[];
  /** Local identifiers, not the platform's. */
  withdrawn: string[];
  changed: boolean;
}

export interface ServersConfig {
  version?: number;
  servers: Server[];
  active: string | null;
  /** Without it the merge would re-add a granted server removed here: it can't tell a removal from a first sight. */
  dismissed?: string[];
}

export type KeyChoice =
  | { mode: "generate" }
  | { mode: "import"; file: string }
  | { mode: "system"; host: string };

export interface ServerDraft {
  name: string;
  /** Blank or absent, the main process draws one from the name. */
  slug?: string;
  host: string;
  port: number;
  user: string;
  key: KeyChoice;
  /** Held nowhere: used once to install the key, then forgotten; a refused one creates nothing. */
  password?: string | null;
}

export interface ServerChanges {
  host?: string;
  port?: number;
  user?: string;
  /** Blank, the main process draws one from the name again. */
  slug?: string;
}

/** The SSH name is other clients' word for the server: the app's own sessions ride the identifier and stand. */
export function movesConnection(changes: ServerChanges): boolean {
  return (
    changes.host !== undefined ||
    changes.port !== undefined ||
    changes.user !== undefined
  );
}

export interface ServerUpdated {
  server: Server;
  config: ServersConfig;
  /** A machine at another address is another machine until it has answered once. */
  hostKeyDropped: boolean;
}

export interface ServerAdded {
  server: Server;
  config: ServersConfig;
  /** Null for a system host. */
  publicKey: string | null;
  copyId: string | null;
  /** Null when no password was given. */
  keyInstall: KeyInstall | null;
}

export interface ServerKnock {
  host: string;
  port: number;
  user: string;
  /** Offered too, so a machine this key already opens is not asked for a password. */
  keyFile: string | null;
}

/** Nothing is sent: the banner the server volunteers is read, and the socket is hung up. */
export interface ServerBanner {
  reached: true;
  /** e.g. `OpenSSH_9.6p1`. */
  software: string;
  ms: number;
}

export interface ServerReachOk extends ServerBanner {
  access: ServerAccess;
}

/** "manual": the app cannot put its key there by itself, and says why before the server exists. */
export type ServerAccess =
  | { access: "opens" }
  | { access: "password" }
  | { access: "manual"; phrase: ErrorPhrase };

export type ReachFailure =
  | "bad-host"
  | "bad-port"
  | "bad-user"
  | "refused"
  | "unreachable"
  | "timeout"
  | "not-ssh";

export interface ServerReachFailed {
  reached: false;
  code: ReachFailure;
  phrase: ErrorPhrase;
}

export type AddressReach = ServerBanner | ServerReachFailed;

export type ServerReach = ServerReachOk | ServerReachFailed;

export type HostKeyAction = "reinstalled" | "cancel";

/** "changed" is a refusal: a reinstall and an impostor look alike, so the person who knows decides. */
export type HostKeyDecision =
  | { status: "first_contact" }
  | { status: "trusted"; fingerprint: string }
  | {
      status: "changed";
      expected: string;
      observed: string | null;
      phrase: ErrorPhrase;
      actions: HostKeyAction[];
    };

/** `verifying` signs in with the key alone: a key written into a file nobody reads does not work. */
export type KeyInstallPhase = "reaching" | "authorizing" | "verifying";

export const KEY_INSTALL_PHASES: readonly KeyInstallPhase[] = [
  "reaching",
  "authorizing",
  "verifying",
];

/** `retry`: a password was tried and refused. */
export type KeyInstall =
  | { status: "opened"; installed: boolean }
  | { status: "password"; retry: boolean }
  | { status: "manual"; phrase: ErrorPhrase };
