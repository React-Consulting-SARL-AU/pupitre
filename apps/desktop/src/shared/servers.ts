/**
 * What the two processes say to each other about servers.
 *
 * The renderer describes a server it would like; the main process is the only
 * one that touches a file, spawns `ssh-keygen` or reads a fingerprint. Nothing
 * here carries a private key: the public half and the line to paste are all the
 * interface ever needs to show.
 *
 * These types belong to the app, not to the agent: a server is a machine this
 * computer knows how to reach, and the agent has never heard of the list.
 */

/**
 * Who owns the configuration that reaches this machine.
 *
 * "app": the address, the port, the account and the key belong to the app,
 * written into its own SSH file. "system": the host is a block of the user's
 * own ~/.ssh/config, and the app writes nothing at all for it.
 */
export type ServerOrigin = "app" | "system";

export interface Server {
  id: string;
  name: string;
  /** An address for an app server, a ~/.ssh/config alias for a system one. */
  host: string;
  port: number;
  /** The remote account. Empty on a system host: its own block says which. */
  user: string;
  origin: ServerOrigin;
  /** The private key in the app's folder. Absent on a system host. */
  keyPath?: string;
  /** The host key recorded on first contact. Absent: never contacted yet. */
  hostFingerprint?: string;
  /** What the platform last said about it. Absent: the platform never named it. */
  grant?: ServerGrant;
}

/**
 * One server the platform grants this account, as `GET /me/servers` says it.
 *
 * The address, the account and the fingerprint come from the platform, and the
 * key is the one this computer already registered as a device: an invited
 * member types neither.
 */
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
}

/** The platform's last word about a server of the local list. */
export interface ServerGrant {
  id: string;
  status: string;
  keyReady: boolean;
  /** Whether the platform still lists it for this account. */
  listed: boolean;
  /** Whether this entry was created from the platform rather than typed here. */
  adopted: boolean;
  /** Whether this computer has already opened it once. */
  opened: boolean;
}

const WITHDRAWN_STATUSES = ["revoked", "suspended"];

/** The platform has taken this server back, or no longer lists it at all. */
export function grantWithdrawn(grant: ServerGrant): boolean {
  return !grant.listed || WITHDRAWN_STATUSES.includes(grant.status);
}

/** Still granted, but not openable yet: no key pushed, or no agent installed. */
export function grantPending(grant: ServerGrant): boolean {
  return (
    !grantWithdrawn(grant) && (!grant.keyReady || grant.status === "enrolling")
  );
}

export function grantOpens(grant: ServerGrant): boolean {
  return !(grantWithdrawn(grant) || grantPending(grant));
}

/** What the merge of the platform's list into the local one produced. */
export interface FleetView {
  granted: FleetServer[];
  config: ServersConfig;
  /** Local identifiers that entered the list on this pass. */
  adopted: string[];
  /** Local identifiers the platform no longer grants. */
  withdrawn: string[];
  /** Whether the merge changed the list the app had on disk. */
  changed: boolean;
}

export interface ServersConfig {
  /** The file's shape, so we know what to fill in when re-reading it. */
  version?: number;
  servers: Server[];
  active: string | null;
}

/**
 * The three ways to give a key, and they differ only in who owns the file.
 *
 * "generate": the app makes one for this computer, which is the one to prefer.
 * "import": a key the user already had, copied into the app's folder.
 * "system": a host already declared in ~/.ssh/config — the app writes nothing.
 */
export type KeyChoice =
  | { mode: "generate" }
  | { mode: "import"; file: string }
  | { mode: "system"; host: string };

export interface ServerDraft {
  name: string;
  host: string;
  port: number;
  user: string;
  key: KeyChoice;
}

export interface ServerAdded {
  server: Server;
  config: ServersConfig;
  /** The public half, and only that. Null for a host of the system. */
  publicKey: string | null;
  copyId: string | null;
}

export type HostKeyAction = "reinstalled" | "cancel";

/**
 * What the pinned fingerprint says about the machine answering today.
 *
 * "changed" is a refusal, not a warning: the app has no way to tell a
 * reinstallation from someone answering in the server's place, so it stops and
 * hands the choice to the person who knows which it is.
 */
export type HostKeyDecision =
  | { status: "first_contact" }
  | { status: "trusted"; fingerprint: string }
  | {
      status: "changed";
      expected: string;
      observed: string | null;
      message: string;
      fix: string;
      actions: HostKeyAction[];
    };
