import { join } from "node:path";
import { isSshHost, isSshUser } from "@pupitre/shared/ssh";
import type {
  HostKeyDecision,
  Server,
  ServerChanges,
  ServerDraft,
  ServerGrant,
  ServersConfig,
  ServerUpdated,
} from "@shared/servers";
import {
  alias,
  isServerId,
  type SshShareState,
  sshNames,
  sshSlug,
} from "@shared/ssh-names";
import { app } from "electron";
import { HARNESSED } from "./harness";
import {
  forgetHostKey,
  hostKeyDecision,
  liveKeys,
  observedFingerprint,
  recordHostKey,
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
  ensureLink,
  identityFile,
  readSystemHosts,
  type SshPaths,
  sshArgs,
  writeSshConfig,
} from "./ssh-config";
import { includeLine, shareAt, sharedAt } from "./ssh-share";
import {
  expectedRevision,
  type VersionedFile,
  versionedFile,
} from "./store-migrations";
import { trace } from "./trace";

type Configuration = Required<
  Pick<ServersConfig, "servers" | "active" | "dismissed">
> & {
  version: number;
};

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

/** A file that exists but cannot be read is not an empty list: nothing is written over it until re-read. */
let unreadable = false;

function userData(): string {
  return app.getPath("userData");
}

/** A scenario run gets a throwaway home, so no suite leaves a line or a link beside the real ~/.ssh/config. */
function home(): string {
  return HARNESSED ? join(userData(), "home") : app.getPath("home");
}

export function paths(): SshPaths {
  return appSshPaths(userData(), home());
}

function path(): string {
  return join(userData(), "servers.json");
}

export function corruptPath(): string {
  return `${path()}.corrupt`;
}

function normaliseServer(raw: Server): Server {
  // Before version 3 an entry pointed at a block of the system SSH config, so no origin reads as "system".
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
    slug:
      origin === "app" && raw.slug
        ? (sshSlug(raw.slug) ?? undefined)
        : undefined,
    user: typeof raw.user === "string" ? raw.user : "",
  };
}

/** An entry written before these checks, or by hand, must never reach the SSH configuration. */
function fitForSsh(server: Server): boolean {
  const account =
    (server.origin === "system" && server.user === "") ||
    isSshUser(server.user);

  return isServerId(server.id) && isSshHost(server.host) && account;
}

function normalise(raw: ServersConfig): Configuration {
  const listed = raw.servers
    .filter((server) => server.id && server.name && server.host)
    .map(normaliseServer);
  const servers = listed.filter(fitForSsh);

  if (servers.length < listed.length) {
    trace("servers", "unfit-dropped", {
      count: listed.length - servers.length,
    });
  }

  const active = servers.some((server) => server.id === raw.active)
    ? raw.active
    : (servers[0]?.id ?? null);

  const dismissed = Array.isArray(raw.dismissed)
    ? [...new Set(raw.dismissed.filter((id) => typeof id === "string" && id))]
    : [];

  return { active, dismissed, servers, version: VERSION };
}

let file: VersionedFile | null = null;

function serversFile(): VersionedFile {
  if (file?.path === path()) {
    return file;
  }

  file = versionedFile({
    baseline: SERVERS_BASELINE,
    migrations: SERVERS_MIGRATIONS,
    path: path(),
    valid: (document) => Array.isArray(document.servers),
  });

  return file;
}

export function reload(): Configuration {
  cache = null;

  return read();
}

export function read(): Configuration {
  if (cache) {
    return cache;
  }

  const held = serversFile().read();

  unreadable = held.status === "corrupt";

  if (held.status === "corrupt") {
    trace("servers", "unreadable", { copy: held.copy });
  }

  if (held.status !== "read") {
    cache = EMPTY;

    return EMPTY;
  }

  if (serversFile().frozen()) {
    trace("servers", "newer", { revision: held.revision });
  }

  const clean = normalise(held.document as unknown as ServersConfig);

  // Written back once: completed only in memory, an old file would silently follow any later change of defaults.
  if (held.migrated) {
    save(clean);
  }

  cache = clean;

  return clean;
}

/** A file from a newer version is left whole for a rollback; the change still holds for this run and its SSH file. */
function save(config: Configuration): void {
  serversFile().write({ ...config });
  writeSshConfig(config.servers, paths(), sshHosts());
}

/** The patch reads again at write time, so a caller that awaited in between never erases a newer write. */
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

export function byId(id: string): Server | null {
  return read().servers.find((server) => server.id === id) ?? null;
}

export function targetOf(serverId: string): string[] {
  const server = byId(serverId);

  return server ? sshArgs(server, paths()) : [];
}

/** `ssh -F` refuses a missing file and a pin needs known_hosts: both must exist before a first server. */
export function sshPathsWritten(): SshPaths {
  writeSshConfig(read().servers, paths(), sshHosts());

  return paths();
}

export function userSshConfigPath(): string {
  return join(home(), ".ssh", "config");
}

export function sshHosts(): string[] {
  return readSystemHosts(userSshConfigPath());
}

export function sshNameOf(serverId: string): string | null {
  return sshNames(read().servers, sshHosts()).get(serverId) ?? null;
}

export function sshShareState(): SshShareState {
  const written = sshPathsWritten();
  const appConfigPath = written.configPath;
  const names = sshNames(read().servers, sshHosts());
  const link = ensureLink(written);

  return {
    line: includeLine(appConfigPath),
    servers: read()
      .servers.filter((server) => server.origin === "app")
      .map((server) => ({
        host: server.host,
        id: server.id,
        identityFile: identityFile(server, written, link),
        name: server.name,
        port: server.port,
        ssh: names.get(server.id) ?? alias(server),
        user: server.user,
      })),
    shared: sharedAt(userSshConfigPath(), appConfigPath),
    userConfigPath: userSshConfigPath(),
  };
}

export function setSshShare(shared: boolean): SshShareState {
  shareAt(userSshConfigPath(), sshPathsWritten().configPath, shared);

  return sshShareState();
}

export async function add(draft: ServerDraft): Promise<ServerCreation> {
  const created = await addServer(draft, read().servers, paths(), sshHosts());

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

/** The old address's pin stays when another listed server still answers there: it is that server's too. */
export async function update(
  id: string,
  changes: ServerChanges
): Promise<ServerUpdated> {
  const before = read().servers.find((server) => server.id === id) ?? null;
  const reserved = sshHosts();
  const changed = changeServer(read().servers, id, changes, reserved);
  const written = write((current) => ({
    ...current,
    servers: changeServer(current.servers, id, changes, reserved).servers,
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

/** Written at enrolment, not at the next fleet read: the installation right after asks the platform by this id. */
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

/** Persisted rather than held in memory: the first-opening customisation is offered once, across relaunches. */
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

/** The merge cannot tell a removal from a first encounter, so a granted server's platform id is dismissed. */
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

export function restore(): Configuration {
  return write((current) => ({ ...current, dismissed: [] }));
}

/** A first contact is pinned now: the fingerprint `ssh` just accepted is the one compared against from here on. */
export async function hostKey(id: string): Promise<HostKeyDecision> {
  const server = byId(id);

  if (!server || server.origin === "system") {
    return { status: "first_contact" };
  }

  const [held, live] = await Promise.all([
    observedFingerprint(server, paths()),
    liveKeys(server),
  ]);
  const presented = live.find(
    (key) => key.fingerprint === server.hostFingerprint
  );

  if (held === null && presented) {
    recordHostKey(presented.line, paths());
  }

  const observed = held ?? presented?.fingerprint ?? null;
  const decision = hostKeyDecision(
    server.hostFingerprint,
    observed,
    live.map((key) => key.fingerprint)
  );

  if (decision.status === "first_contact" && observed) {
    write((current) => ({
      ...current,
      servers: pinFingerprint(current.servers, id, observed),
    }));
  }

  return decision;
}

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
