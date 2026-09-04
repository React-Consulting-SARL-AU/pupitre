import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type {
  HostKeyDecision,
  Server,
  ServerDraft,
  ServersConfig,
} from "@shared/servers";
import { app } from "electron";
import { hostKeyDecision, observedFingerprint } from "./host-keys";
import { readPublicKey } from "./keys";
import {
  addServer,
  pinFingerprint,
  removeServer,
  type ServerCreation,
  untrustHost,
  withAccount,
} from "./server-setup";
import {
  alias,
  appSshPaths,
  readSystemHosts,
  type SshPaths,
  sshArgs,
  writeSshConfig,
} from "./ssh-config";

/**
 * The known servers, and which one is active.
 *
 * The file lives in the app's data folder, not in the repository: these are the
 * machines of whoever uses it. Every write to it is followed by a rewrite of
 * the app's SSH configuration, so the two never drift apart — and neither of
 * them is ever the user's own ~/.ssh.
 */
type Configuration = Required<Pick<ServersConfig, "servers" | "active">> & {
  version: number;
};

/**
 * Version 3 makes the app the owner of the connection: a server carries its
 * address, its port, its account and its key rather than pointing at a block of
 * the system configuration. An older entry did point at one, so it is read back
 * as what it was — a system host — and nothing of the user's is touched.
 */
const VERSION = 3;
const DEFAULT_PORT = 22;
const NAME_LIMIT = 60;
const HOST_LIMIT = 120;

const EMPTY: Configuration = { active: null, servers: [], version: VERSION };

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

  return { active, servers, version: VERSION };
}

export function read(): Configuration {
  if (cache) {
    return cache;
  }

  try {
    const data = JSON.parse(readFileSync(path(), "utf8")) as ServersConfig;
    if (Array.isArray(data.servers)) {
      const clean = normalise(data);
      // An older configuration goes back to disk completed, once: otherwise
      // every launch would complete it in memory, and the day the defaults
      // changed it would change with them.
      if ((data.version ?? 1) < VERSION) {
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

export function sshHosts(): string[] {
  return readSystemHosts(join(homedir(), ".ssh", "config"));
}

export async function add(draft: ServerDraft): Promise<ServerCreation> {
  const config = read();
  const created = await addServer(draft, config.servers, paths());

  write({ active: created.server.id, servers: created.servers });

  return created;
}

export function rename(id: string, name: string): Configuration {
  const config = read();

  return write({
    active: config.active,
    servers: config.servers.map((server) =>
      server.id === id
        ? { ...server, name: name.trim().slice(0, NAME_LIMIT) || server.name }
        : server
    ),
  });
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

  write({ active: config.active, servers });

  return user;
}

export function activate(id: string): Configuration {
  const config = read();

  return config.servers.some((server) => server.id === id)
    ? write({ active: id, servers: config.servers })
    : config;
}

export function remove(id: string): Configuration {
  const config = read();
  const left = removeServer(config.servers, id, paths());

  return write({
    active: config.active === id ? (left[0]?.id ?? null) : config.active,
    servers: left,
  });
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

  const observed = await observedFingerprint(server, paths());
  const decision = hostKeyDecision(server.hostFingerprint, observed);

  if (decision.status === "first_contact" && observed) {
    const config = read();
    write({
      active: config.active,
      servers: pinFingerprint(config.servers, id, observed),
    });
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
    active: config.active,
    servers: config.servers.map((s) =>
      s.id === id ? { ...s, hostFingerprint: undefined } : s
    ),
  });
}

export function publicKey(id: string): string | null {
  const server = byId(id);

  return server?.origin === "app" ? readPublicKey(paths().keysDir, id) : null;
}
