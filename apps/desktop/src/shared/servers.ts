import type { ErrorPhrase } from "./agent";
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
  /**
   * The word typed after `ssh`, and handed to editors and coding agents.
   *
   * Chosen by the reader, beside the name; absent on a system host, which is
   * its own alias, and on a server that answers to `pupitre-<id>` alone.
   */
  slug?: string;
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
  /** The organization that owns the server, as the platform names it. */
  organization: ServerOrganization;
}

export interface ServerOrganization {
  id: string;
  name: string;
}

/** The platform's last word about a server of the local list. */
export interface ServerGrant {
  id: string;
  status: string;
  keyReady: boolean;
  /** What the platform says about the server's organization. Absent from an earlier version of the file. */
  organization?: ServerOrganization;
  /** Whether the platform still lists it for this account. */
  listed: boolean;
  /** Whether this entry was created from the platform rather than typed here. */
  adopted: boolean;
  /** Whether this computer has already opened it once. */
  opened: boolean;
}

/**
 * The platform has let this server go, and nothing here brings it back.
 *
 * Unlisted or revoked are the two ways out, and both are final: the console
 * deletes, the enrolment expires, the membership ends. A suspended server is
 * not one of them — a subscription comes back, and the entry has to survive
 * the wait.
 */
export function grantGone(grant: ServerGrant): boolean {
  return !grant.listed || grant.status === "revoked";
}

/** The platform has taken this server back, for good or while it is suspended. */
export function grantWithdrawn(grant: ServerGrant): boolean {
  return grantGone(grant) || grant.status === "suspended";
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
  /**
   * The platform identifiers this computer was told to stop showing.
   *
   * Without it the merge would put back, on the next reading, every granted
   * server someone has just removed here: the platform still grants it, and
   * the merge has no other way to tell a removal from a first sight.
   */
  dismissed?: string[];
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
  /** The SSH name as typed; blank or absent, the main process draws one from the name. */
  slug?: string;
  host: string;
  port: number;
  user: string;
  key: KeyChoice;
  /**
   * The remote account's password, when the knock said the machine takes one.
   *
   * It crosses the bridge with the draft and is held nowhere: the main process
   * puts its key on the machine with it, once, and forgets it. A refused
   * password creates nothing — no key, no entry — and comes back as a refusal
   * of the form.
   */
  password?: string | null;
}

/** What may change on a server the app reaches: its address, its port, its account, its SSH name. */
export interface ServerChanges {
  host?: string;
  port?: number;
  user?: string;
  /** As typed; blank, the main process draws one from the name again. */
  slug?: string;
}

/**
 * Whether a change reaches the machine differently: what is open on the
 * server speaks to the old address, port or account and has to be reopened.
 * The SSH name is other clients' word for the server — the app's own sessions
 * ride the identifier and stand.
 */
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
  /**
   * The pinned host key went with the old address: a machine at another
   * address is another machine until it has answered once. The next
   * connection pins what answers there, as a first contact does.
   */
  hostKeyDropped: boolean;
}

export interface ServerAdded {
  server: Server;
  config: ServersConfig;
  /** The public half, and only that. Null for a host of the system. */
  publicKey: string | null;
  copyId: string | null;
  /** What came of installing the key with the password, when one was given. */
  keyInstall: KeyInstall | null;
}

/**
 * What the form asks the main process to knock on, before anything exists.
 *
 * The file is the key a reader pointed at to import: it is offered along with
 * what this computer already holds, so a machine that key opens is not asked
 * for a password it may not even have.
 */
export interface ServerKnock {
  host: string;
  port: number;
  user: string;
  keyFile: string | null;
}

/**
 * What an address answered when the app knocked, before any key exists.
 *
 * The three ways of giving a key do not all have one yet at this point — the
 * recommended one makes its key with the server — so what is testable ahead of
 * adding is the address itself: something listens there, and it speaks SSH.
 * Nothing is sent and nothing is written: the banner a server volunteers is
 * read, and the socket is hung up.
 */
export interface ServerBanner {
  reached: true;
  /** How the address introduced itself, e.g. `OpenSSH_9.6p1`. */
  software: string;
  /** How long the address took to answer, in milliseconds. */
  ms: number;
}

export interface ServerReachOk extends ServerBanner {
  access: ServerAccess;
}

/**
 * What the account answered when this computer knocked with what it holds.
 *
 * "opens": an agent, a key of ~/.ssh or the file to import already opens it,
 * and the key will install without a word. "password": nothing here opens it
 * and the machine takes a password — the one thing worth asking before the key
 * is made. "manual": the app will not be able to put its key there by itself,
 * for the reason the phrase gives, and says so before the server exists.
 */
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
  /** What the screen must render: the main process names it, it doesn't write it. */
  phrase: ErrorPhrase;
}

/** The address alone: what listens there, before the account is asked anything. */
export type AddressReach = ServerBanner | ServerReachFailed;

export type ServerReach = ServerReachOk | ServerReachFailed;

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
      phrase: ErrorPhrase;
      actions: HostKeyAction[];
    };

/**
 * Where the app is while it puts its own key on a server it has just added.
 *
 * `reaching` asks the machine whether the key already opens it, `authorizing`
 * appends the public half to the account's `authorized_keys`, `verifying` opens
 * the machine again with that key alone. The third phase is not decoration: a
 * key written into a file nobody reads is a key that does not work, and only
 * signing in with it proves otherwise.
 */
export type KeyInstallPhase = "reaching" | "authorizing" | "verifying";

export const KEY_INSTALL_PHASES: readonly KeyInstallPhase[] = [
  "reaching",
  "authorizing",
  "verifying",
];

/**
 * What came of the app installing the key by itself.
 *
 * "opened": the key opens the machine, whether the app has just put it there or
 * found it already in place. "password": nothing this computer holds opens the
 * machine yet, and the account's password is what would let the app in — asked
 * again when one was tried and refused. "manual": the app cannot do it at all,
 * and hands back the line to paste rather than pretending otherwise.
 */
export type KeyInstall =
  | { status: "opened"; installed: boolean }
  | { status: "password"; retry: boolean }
  | { status: "manual"; phrase: ErrorPhrase };
