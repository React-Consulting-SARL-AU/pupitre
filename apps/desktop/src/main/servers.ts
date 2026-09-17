import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type {
  HostKeyDecision,
  Server,
  ServerChanges,
  ServerDraft,
  ServerGrant,
  ServersConfig,
  ServerUpdated,
} from "@shared/servers";
import { alias, type SshShareState, sshNames } from "@shared/ssh-names";
import { app } from "electron";
import { HARNESSED } from "./harness";
import {
  forgetHostKey,
  hostKeyDecision,
  liveFingerprints,
  observedFingerprint,
} from "./host-keys";
import { readPublicKey } from "./keys";
import {
  addServer,
  changeServer,
  pinFingerprint,
  removeServer,
  type ServerCreation,
  sharesAddress,
  untrustHost,
  withAccount,
} from "./server-setup";
import { SERVERS_BASELINE, SERVERS_MIGRATIONS } from "./servers-migrations";
import {
  type Address,
  appSshPaths,
  readSystemHosts,
  type SshPaths,
  sshArgs,
  writeSshConfig,
} from "./ssh-config";
import { includeLine, shareAt, sharedAt } from "./ssh-share";
import {
  expectedRevision,
  type JsonObject,
  keepCopy,
  migrate,
} from "./store-migrations";
import { trace } from "./trace";

/**
 * The known servers, and which one is active.
 *
 * The file lives in the app's data folder, not in the repository: these are the
 * machines of whoever uses it. Every write to it is followed by a rewrite of
 * the app's SSH configuration, so the two never drift apart — and neither of
 * them is ever the user's own ~/.ssh.
 */
type Configuration = Required<
  Pick<ServersConfig, "servers" | "active" | "dismissed">
> & {
  version: number;
};

/**
 * Version 3 makes the app the owner of the connection: a server carries its
 * address, its port, its account and its key rather than pointing at a block of
 * the system configuration. An older entry did point at one, so it is read back
 * as what it was — a system host — and nothing of the user's is touched.
 *
 * From there on the ledger carries the shapes, one entry per change.
 */
const VERSION = Math.max(
  SERVERS_BASELINE,
  expectedRevision(SERVERS_MIGRATIONS)
);
const DEFAULT_PORT = 22;
const NAME_LIMIT = 60;
const HOST_LIMIT = 120;

const EMPTY: Configuration = {
  active: null,
  dismissed: [],
  servers: [],
  version: VERSION,
};

let cache: Configuration | null = null;

/**
 * A file that exists and cannot be read is not an empty list: the app shows
 * none of its servers, and writes nothing over the file until it reads again.
 */
let unreadable = false;

function userData(): string {
  return app.getPath("userData");
}

export function paths(): SshPaths {
  return appSshPaths(userData());
}

function path(): string {
  return join(userData(), "servers.json");
}

/** Where a file the app could not read is kept aside, for whoever has to look. */
export function corruptPath(): string {
  return `${path()}.corrupt`;
}

function normaliseServer(raw: Server): Server {
  const origin = raw.origin === "app" ? "app" : "system";
  const port =
    Number.isInteger(raw.port) && raw.port > 0 ? raw.port : DEFAULT_PORT;

  return {
    ...(raw.grant?.id ? { grant: raw.grant } : {}),
    host: raw.host.slice(0, HOST_LIMIT),
    hostFingerprint: raw.hostFingerprint || undefined,
    id: raw.id,
    keyPath: origin === "app" ? raw.keyPath : undefined,
    name: raw.name.slice(0, NAME_LIMIT),
    origin,
    port,
    user: typeof raw.user === "string" ? raw.user : "",
  };
}

function normalise(raw: ServersConfig): Configuration {
  const servers = raw.servers
    .filter((server) => server.id && server.name && server.host)
    .map(normaliseServer);

  const active = servers.some((server) => server.id === raw.active)
    ? raw.active
    : (servers[0]?.id ?? null);

  const dismissed = Array.isArray(raw.dismissed)
    ? [...new Set(raw.dismissed.filter((id) => typeof id === "string" && id))]
    : [];

  return { active, dismissed, servers, version: VERSION };
}

function parsed(): Configuration | null {
  const raw = JSON.parse(readFileSync(path(), "utf8")) as JsonObject;
  const held = raw as unknown as ServersConfig;

  if (!Array.isArray(held.servers)) {
    return null;
  }

  const from = typeof raw.version === "number" ? raw.version : 1;
  const migrated = migrate(raw, SERVERS_MIGRATIONS);
  const clean = normalise(migrated.document as unknown as ServersConfig);

  // An older configuration goes back to disk completed, once: otherwise
  // every launch would complete it in memory, and the day the defaults
  // changed it would change with them. The file as it was stays beside it,
  // for a reader who has to go back to the version they came from.
  if (from < VERSION) {
    keepCopy(path(), from);
    save(clean);
  }

  return clean;
}

/** The file read again, whatever was held: what a write does before touching a file it could not read. */
export function reload(): Configuration {
  cache = null;

  return read();
}

export function read(): Configuration {
  if (cache) {
    return cache;
  }

  if (!existsSync(path())) {
    unreadable = false;
    cache = EMPTY;

    return EMPTY;
  }

  let clean: Configuration | null = null;

  try {
    clean = parsed();
  } catch {
    clean = null;
  }

  if (!clean) {
    copyFileSync(path(), corruptPath());
    trace("servers", "unreadable", { copy: corruptPath() });
  }

  unreadable = clean === null;
  cache = clean ?? EMPTY;

  return cache;
}

/**
 * Written aside and renamed over: a crash in the middle leaves either the
 * previous file or the new one, never a truncated list of servers.
 */
function save(config: Configuration): void {
  const target = path();
  const staging = `${target}.tmp`;

  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(staging, JSON.stringify(config, null, 2), "utf8");
  renameSync(staging, target);
  writeSshConfig(config.servers, paths(), sshHosts());
}

/**
 * The change, applied to what the file holds now.
 *
 * A caller that read the list, waited on something — a key to install, a
 * host to untrust — and wrote back what it had read would erase whatever was
 * written meanwhile: the patch reads again at the moment of writing. A file
 * that could not be read is read once more first, and refused if it still
 * cannot be: nothing overwrites a list the app has not seen.
 */
export function write(
  patch: (current: Configuration) => ServersConfig
): Configuration {
  if (unreadable) {
    reload();
  }

  if (unreadable) {
    throw new Error(`servers.json unreadable, copy kept at ${corruptPath()}`);
  }

  const clean = normalise(patch(read()));

  save(clean);
  cache = clean;

  return clean;
}

/** No server yet is a state the app has to show, not one it can guess around. */
export function active(): Server | null {
  const config = read();

  return config.servers.find((s) => s.id === config.active) ?? null;
}

export function byId(id: string): Server | null {
  return read().servers.find((server) => server.id === id) ?? null;
}

/** The ssh arguments of one server, for what opens its own link: a terminal. */
export function targetOf(serverId: string): string[] {
  const server = byId(serverId);

  return server ? sshArgs(server, paths()) : [];
}

/** What to write when naming the server: the alias, never a bare address. */
export function activeHost(): string {
  const server = active();

  return server ? alias(server) : "";
}

/**
 * The app's SSH files, made to exist before a first server does.
 *
 * A knock on an account passes `-F` to `ssh`, which refuses a file it cannot
 * open, and pins the host key into a known_hosts that has to be there: on a
 * first launch neither is until something is saved.
 */
export function sshPathsWritten(): SshPaths {
  writeSshConfig(read().servers, paths(), sshHosts());

  return paths();
}

/**
 * The system's own file, read for its hosts and written for one line.
 *
 * A scenario run gets one inside the folder it throws away: a suite that left
 * a line in the reader's real file would outlive itself.
 */
export function userSshConfigPath(): string {
  return HARNESSED
    ? join(userData(), "home", ".ssh", "config")
    : join(homedir(), ".ssh", "config");
}

export function sshHosts(): string[] {
  return readSystemHosts(userSshConfigPath());
}

/** The word that names one server after `ssh`, or in an editor's link. */
export function sshNameOf(serverId: string): string | null {
  return sshNames(read().servers, sshHosts()).get(serverId) ?? null;
}

export function sshShareState(): SshShareState {
  const appConfigPath = sshPathsWritten().configPath;
  const names = sshNames(read().servers, sshHosts());

  return {
    line: includeLine(appConfigPath),
    servers: read()
      .servers.filter((server) => server.origin === "app")
      .map((server) => ({
        id: server.id,
        name: server.name,
        ssh: names.get(server.id) ?? alias(server),
      })),
    shared: sharedAt(userSshConfigPath(), appConfigPath),
    userConfigPath: userSshConfigPath(),
  };
}

/** The system's file with or without the app's line, and what it says after. */
export function setSshShare(shared: boolean): SshShareState {
  shareAt(userSshConfigPath(), sshPathsWritten().configPath, shared);

  return sshShareState();
}

export async function add(draft: ServerDraft): Promise<ServerCreation> {
  const created = await addServer(draft, read().servers, paths());

  write((current) => ({
    ...current,
    active: created.server.id,
    servers: [
      ...current.servers.filter((server) => server.id !== created.server.id),
      created.server,
    ],
  }));

  trace("servers", "added", {
    host: created.server.host,
    key: draft.key.mode,
    origin: created.server.origin,
    port: created.server.port,
    server: created.server.id,
    user: created.server.user,
  });

  return created;
}

export function rename(id: string, name: string): Configuration {
  return write((current) => ({
    ...current,
    servers: current.servers.map((server) =>
      server.id === id
        ? { ...server, name: name.trim().slice(0, NAME_LIMIT) || server.name }
        : server
    ),
  }));
}

/**
 * The address, the port or the account of a server, changed by the reader.
 *
 * The configuration is written before anything else: `save` rewrites the SSH
 * file, so the next `ssh -F` reaches the new address. A pin left for the old
 * address is dropped from the app's known_hosts too, unless another server of
 * the list still answers there — it is theirs as much as it was this one's.
 */
export async function update(
  id: string,
  changes: ServerChanges
): Promise<ServerUpdated> {
  const before = read().servers.find((server) => server.id === id) ?? null;
  const changed = changeServer(read().servers, id, changes);
  const written = write((current) => ({
    ...current,
    servers: changeServer(current.servers, id, changes).servers,
  }));

  if (
    before &&
    changed.hostKeyDropped &&
    !sharesAddress(changed.servers, before)
  ) {
    await untrustHost(before, paths());
  }

  trace("servers", "changed", {
    host: changed.server.host,
    hostKeyDropped: changed.hostKeyDropped,
    port: changed.server.port,
    server: id,
    user: changed.server.user,
  });

  return {
    config: written,
    hostKeyDropped: changed.hostKeyDropped,
    server: changed.server,
  };
}

/**
 * The account this server is reached with, after the hardening opened another.
 *
 * Writing the configuration is what makes the switch real: `save` rewrites the
 * app's SSH file, so the next `ssh -F` logs in as the account the agent named.
 */
export function switchAccount(id: string, user: string): string | null {
  if (!withAccount(read().servers, id, user)) {
    return null;
  }

  write((current) => ({
    ...current,
    servers: withAccount(current.servers, id, user) ?? current.servers,
  }));

  trace("servers", "account", { server: id, user });

  return user;
}

/**
 * The identity the platform gives a server the moment it enrols it.
 *
 * Written before the binary leaves rather than at the next reading of the
 * fleet: what the platform manages for that server — a tunnel, a hostname — is
 * asked for by this identifier, and the installation that follows asks for it
 * straight away. A grant already bound to the same identifier is left alone: it
 * carries what the platform last said, and that is fresher than an enrolment.
 */
export function noteGrant(id: string, platformServerId: string): Configuration {
  const config = read();
  const server = config.servers.find((candidate) => candidate.id === id);

  if (!server || server.grant?.id === platformServerId) {
    return config;
  }

  const grant: ServerGrant = {
    adopted: server.grant?.adopted ?? false,
    id: platformServerId,
    keyReady: false,
    listed: true,
    opened: server.grant?.opened ?? false,
    status: "enrolling",
  };

  return write((current) => ({
    ...current,
    servers: current.servers.map((candidate) =>
      candidate.id === id ? { ...candidate, grant } : candidate
    ),
  }));
}

/**
 * The first opening of a server the platform granted.
 *
 * Written down rather than kept in memory: the customisation the app offers on
 * that first opening is offered once, and a relaunch is not a first opening.
 */
export function noteOpened(id: string): Configuration {
  const config = read();

  if (!config.servers.some((server) => server.id === id)) {
    return config;
  }

  return write((current) => ({
    ...current,
    active: id,
    servers: current.servers.map((server) =>
      server.id === id && server.grant
        ? { ...server, grant: { ...server.grant, opened: true } }
        : server
    ),
  }));
}

export function activate(id: string): Configuration {
  const config = read();

  return config.servers.some((server) => server.id === id)
    ? write((current) => ({ ...current, active: id }))
    : config;
}

/**
 * Remove a server from this computer, and have it stay removed.
 *
 * A server the platform grants would come back on the next read — the merge has
 * no way to tell a removal from a first encounter — so its platform id is
 * recorded. `restore` is the way back, and the only one.
 */
export async function remove(id: string): Promise<Configuration> {
  const going = read().servers.find((server) => server.id === id);
  const left = removeServer(read().servers, id, paths());
  const grantId = going?.grant?.id;

  if (going && !sharesAddress(left, going)) {
    await untrustHost(going, paths());
  }

  return write((current) => {
    const servers = current.servers.filter((server) => server.id !== id);

    return {
      active: current.active === id ? (servers[0]?.id ?? null) : current.active,
      dismissed: grantId
        ? [...new Set([...current.dismissed, grantId])]
        : current.dismissed,
      servers,
    };
  });
}

/** Returns to the list every granted server that had been removed from here. */
export function restore(): Configuration {
  return write((current) => ({ ...current, dismissed: [] }));
}

/**
 * What the app's known_hosts says about a server, compared to what it pinned.
 *
 * A first contact is pinned here rather than left to the next connection: the
 * fingerprint `ssh` has just accepted is the one to compare against from now on.
 */
export async function hostKey(id: string): Promise<HostKeyDecision> {
  const server = byId(id);
  if (!server || server.origin === "system") {
    return { status: "first_contact" };
  }

  const [observed, live] = await Promise.all([
    observedFingerprint(server, paths()),
    liveFingerprints(server),
  ]);
  const decision = hostKeyDecision(server.hostFingerprint, observed, live);

  if (decision.status === "first_contact" && observed) {
    write((current) => ({
      ...current,
      servers: pinFingerprint(current.servers, id, observed),
    }));
  }

  return decision;
}

/**
 * The one way out of a refused connection: the machine was reinstalled, so the
 * old fingerprint is dropped and the next contact pins whatever answers.
 */
export async function trustReinstalled(id: string): Promise<Configuration> {
  const server = byId(id);
  if (!server) {
    return read();
  }

  await untrustHost(server, paths());

  return write((current) => ({
    ...current,
    servers: current.servers.map((s) =>
      s.id === id ? { ...s, hostFingerprint: undefined } : s
    ),
  }));
}

/**
 * A pin at an address no listed server reaches is a leftover: the machine that
 * earned it left the list, or was rebuilt before this version cleared it.
 */
export async function forgetOrphanPin(address: Address): Promise<boolean> {
  if (sharesAddress(read().servers, address)) {
    return false;
  }

  await forgetHostKey(address, paths());

  return true;
}

export function publicKey(id: string): string | null {
  const server = byId(id);

  return server?.origin === "app" ? readPublicKey(paths().keysDir, id) : null;
}
