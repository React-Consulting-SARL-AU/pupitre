import { isSshHost, isSshPort, isSshUser } from "@pupitre/shared/ssh";
import type { ErrorPhrase } from "@shared/agent";
import type {
  KeyChoice,
  Server,
  ServerChanges,
  ServerDraft,
} from "@shared/servers";
import { sshNameFree, sshSlug } from "@shared/ssh-names";
import { forgetHostKey } from "./host-keys";
import {
  copyIdCommand,
  generateKey,
  importKey,
  KeyError,
  removeKey,
} from "./keys";
import type { Address, SshPaths } from "./ssh-config";

/**
 * Adding, pinning and removing a server, without ever leaving the app's folder.
 *
 * Three ways to give a key, and the difference between them is only who owns
 * the file: the app generates one, the app copies one in, or the app uses none
 * at all because the host already lives in the user's own configuration. That
 * last case is the only one where the app writes nothing, and it writes nothing
 * anywhere — no block, no key, no known_hosts entry.
 */

const NAME_LIMIT = 60;

export class SetupError extends Error {
  readonly phrase: ErrorPhrase;

  constructor(id: string, values?: Record<string, string | number>) {
    super(id);
    this.name = "SetupError";
    this.phrase = values ? { id, values } : { id };
  }
}

export interface ServerCreation {
  server: Server;
  servers: Server[];
  publicKey: string | null;
  copyId: string | null;
}

/**
 * The SSH name a server gets: what was typed, made fit for a `Host` line, or
 * the name itself when nothing was typed. A word that already names another
 * machine is refused when typed; drawn from the name, it is simply not given,
 * and the server answers to its identifier alone.
 */
function sshNameOf(
  typed: string | undefined,
  name: string,
  servers: Server[],
  reserved: readonly string[],
  self?: string
): string | undefined {
  const wanted = typed?.trim() ?? "";

  if (wanted) {
    const slug = sshSlug(wanted);

    if (slug === null) {
      throw new SetupError("refusal.setup.sshName", { name: wanted });
    }

    refuse(
      sshNameFree(slug, servers, reserved, self),
      "refusal.setup.sshNameTaken",
      { name: slug }
    );

    return slug;
  }

  const drawn = sshSlug(name);

  return drawn && sshNameFree(drawn, servers, reserved, self)
    ? drawn
    : undefined;
}

function refuse(
  condition: boolean,
  id: string,
  values?: Record<string, string | number>
): void {
  if (!condition) {
    throw new SetupError(id, values);
  }
}

function freshId(servers: Server[]): string {
  const stem = `srv-${Date.now().toString(36)}`;
  let id = stem;
  let attempt = 1;

  while (servers.some((server) => server.id === id)) {
    id = `${stem}-${attempt}`;
    attempt += 1;
  }

  return id;
}

async function keyFor(
  choice: KeyChoice,
  id: string,
  paths: SshPaths
): Promise<{ keyPath: string; publicKeyPath: string; publicKey: string }> {
  try {
    return choice.mode === "import"
      ? await importKey(paths.keysDir, id, choice.file)
      : await generateKey(paths.keysDir, id);
  } catch (cause) {
    if (cause instanceof KeyError) {
      throw new SetupError(cause.phrase.id, cause.phrase.values);
    }
    throw cause;
  }
}

export async function addServer(
  draft: ServerDraft,
  servers: Server[],
  paths: SshPaths,
  reserved: readonly string[] = []
): Promise<ServerCreation> {
  const fromSystem = draft.key.mode === "system";
  const host = (
    draft.key.mode === "system" ? draft.key.host : draft.host
  ).trim();
  const user = draft.user.trim();
  const name = draft.name.trim().slice(0, NAME_LIMIT) || host;

  refuse(isSshHost(host), "refusal.setup.host", { host });
  refuse(isSshPort(draft.port), "refusal.setup.port", { port: draft.port });

  const id = freshId(servers);

  if (fromSystem) {
    const server: Server = {
      host,
      id,
      name,
      origin: "system",
      port: draft.port,
      user,
    };

    return {
      copyId: null,
      publicKey: null,
      server,
      servers: [...servers, server],
    };
  }

  refuse(isSshUser(user), "refusal.setup.user", { user });

  const slug = sshNameOf(draft.slug, name, servers, reserved);
  const pair = await keyFor(draft.key, id, paths);
  const server: Server = {
    host,
    id,
    keyPath: pair.keyPath,
    name,
    origin: "app",
    port: draft.port,
    ...(slug ? { slug } : {}),
    user,
  };

  return {
    copyId: copyIdCommand(server, pair.publicKeyPath),
    publicKey: pair.publicKey,
    server,
    servers: [...servers, server],
  };
}

export function pinFingerprint(
  servers: Server[],
  id: string,
  fingerprint: string
): Server[] {
  return servers.map((server) =>
    server.id === id ? { ...server, hostFingerprint: fingerprint } : server
  );
}

const ACCOUNT = /^[a-z_][a-z0-9_-]{0,31}$/;

/**
 * The account the app connects with, moved to the one the hardening opened.
 *
 * The name comes from the agent, so it is checked against what a Unix account
 * can be called before it becomes a `User` line: the app's SSH configuration is
 * a file `ssh` reads, and a name with a space in it would be two words there.
 * A host taken from the system configuration is refused outright — the app owns
 * no block for it, and promised to write none.
 */
export function withAccount(
  servers: Server[],
  id: string,
  user: string
): Server[] | null {
  const target = servers.find((server) => server.id === id);

  if (!(target && target.origin === "app" && ACCOUNT.test(user))) {
    return null;
  }

  return servers.map((server) =>
    server.id === id ? { ...server, user } : server
  );
}

/**
 * Whether another server of the app answers at the same address and port.
 *
 * A pinned host key belongs to the servers that reach it: the day the last one
 * leaves the list, the pin is nobody's, and a machine rebuilt behind that
 * address would otherwise be refused on its way back in, with no one to say
 * "reinstalled" for it.
 */
export function sharesAddress(
  servers: Server[],
  address: Address,
  except?: string
): boolean {
  return servers.some(
    (server) =>
      server.id !== except &&
      server.origin === "app" &&
      server.host === address.host &&
      server.port === address.port
  );
}

/** Forgetting a server takes the key the app made for it, and nothing else. */
export function removeServer(
  servers: Server[],
  id: string,
  paths: SshPaths
): Server[] {
  const going = servers.find((server) => server.id === id);

  if (going?.origin === "app") {
    removeKey(paths.keysDir, id);
  }

  return servers.filter((server) => server.id !== id);
}

export function untrustHost(server: Server, paths: SshPaths): Promise<void> {
  return server.origin === "system"
    ? Promise.resolve()
    : forgetHostKey(server, paths);
}

/**
 * A server's address, port or account, changed in place.
 *
 * Only a server the app reaches can change: a host of the system configuration
 * is that file's, and the app writes nothing for it. The same checks as an
 * addition apply — what becomes a `HostName`, a `Port` or a `User` line of the
 * app's SSH file cannot read as an option or as two words. The pinned key goes
 * when the address does: it belonged to the machine that answered there.
 */
export function changeServer(
  servers: Server[],
  id: string,
  changes: ServerChanges,
  reserved: readonly string[] = []
): { servers: Server[]; server: Server; hostKeyDropped: boolean } {
  const target = servers.find((server) => server.id === id);

  refuse(Boolean(target), "refusal.server.unknown");

  const held = target as Server;

  refuse(held.origin === "app", "refusal.setup.system");

  const host = (changes.host ?? held.host).trim();
  const port = changes.port ?? held.port;
  const user = (changes.user ?? held.user).trim();

  refuse(isSshHost(host), "refusal.setup.host", { host });
  refuse(isSshPort(port), "refusal.setup.port", { port });
  refuse(isSshUser(user), "refusal.setup.user", { user });

  const slug =
    changes.slug === undefined
      ? held.slug
      : sshNameOf(changes.slug, held.name, servers, reserved, id);
  const moved = host !== held.host || port !== held.port;
  const server: Server = {
    ...held,
    host,
    hostFingerprint: moved ? undefined : held.hostFingerprint,
    port,
    slug,
    user,
  };

  return {
    hostKeyDropped: moved && held.hostFingerprint !== undefined,
    server,
    servers: servers.map((one) => (one.id === id ? server : one)),
  };
}
