import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
import { app } from "electron";
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
  alias,
  appSshPaths,
  readSystemHosts,
  type SshPaths,
  sshArgs,
  writeSshConfig,
} from "./ssh-config";
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

function userData(): string {
  return app.getPath("userData");
}

export function paths(): SshPaths {
  return appSshPaths(userData());
}

function path(): string {
  return join(userData(), "servers.json");
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

export function read(): Configuration {
  if (cache) {
    return cache;
  }

  try {
    const raw = JSON.parse(readFileSync(path(), "utf8")) as JsonObject;
    const held = raw as unknown as ServersConfig;

    if (Array.isArray(held.servers)) {
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

      cache = clean;
      return clean;
    }
  } catch {
    // First launch, or unreadable file: no server yet, and the app says so.
  }

  cache = EMPTY;
  return EMPTY;
}

function save(config: Configuration): void {
  mkdirSync(dirname(path()), { recursive: true });
  writeFileSync(path(), JSON.stringify(config, null, 2), "utf8");
  writeSshConfig(config.servers, paths());
}

export function write(config: ServersConfig): Configuration {
  const clean = normalise(config);

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
  writeSshConfig(read().servers, paths());

  return paths();
}

export function sshHosts(): string[] {
  return readSystemHosts(join(homedir(), ".ssh", "config"));
}

export async function add(draft: ServerDraft): Promise<ServerCreation> {
  const config = read();
  const created = await addServer(draft, config.servers, paths());

  write({ ...config, active: created.server.id, servers: created.servers });

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
  const config = read();

  return write({
    ...config,
    servers: config.servers.map((server) =>
      server.id === id
        ? { ...server, name: name.trim().slice(0, NAME_LIMIT) || server.name }
        : server
    ),
  });
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
  const config = read();
  const before = config.servers.find((server) => server.id === id) ?? null;
  const changed = changeServer(config.servers, id, changes);
  const written = write({ ...config, servers: changed.servers });

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
  const config = read();
  const servers = withAccount(config.servers, id, user);

  if (!servers) {
    return null;
  }

  write({ ...config, servers });

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

  return write({
    ...config,
    servers: config.servers.map((candidate) =>
      candidate.id === id ? { ...candidate, grant } : candidate
    ),
  });
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

  return write({
    ...config,
    active: id,
    servers: config.servers.map((server) =>
      server.id === id && server.grant
        ? { ...server, grant: { ...server.grant, opened: true } }
        : server
    ),
  });
}

export function activate(id: string): Configuration {
  const config = read();

  return config.servers.some((server) => server.id === id)
    ? write({ ...config, active: id })
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
  const config = read();
  const going = config.servers.find((server) => server.id === id);
  const left = removeServer(config.servers, id, paths());
  const grantId = going?.grant?.id;

  if (going && !sharesAddress(left, going)) {
    await untrustHost(going, paths());
  }

  return write({
    active: config.active === id ? (left[0]?.id ?? null) : config.active,
    dismissed: grantId
      ? [...new Set([...config.dismissed, grantId])]
      : config.dismissed,
    servers: left,
  });
}

/** Returns to the list every granted server that had been removed from here. */
export function restore(): Configuration {
  const config = read();

  return write({ ...config, dismissed: [] });
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
    const config = read();
    write({ ...config, servers: pinFingerprint(config.servers, id, observed) });
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

  const config = read();

  return write({
    ...config,
    servers: config.servers.map((s) =>
      s.id === id ? { ...s, hostFingerprint: undefined } : s
    ),
  });
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
