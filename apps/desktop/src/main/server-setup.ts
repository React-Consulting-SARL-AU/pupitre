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

/** A taken name is refused when typed, but silently skipped when drawn from the display name. */
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

  // A host of the user's own SSH config: the app writes nothing for it, no block, key or known_hosts entry.
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

/** The agent's account name becomes a `User` line: checked so it cannot read as two words there. */
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

/** A pin nobody reaches any more must go, or a machine rebuilt there is refused with no one to trust it. */
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

/** The pinned key goes with the address: it belonged to the machine that answered there. */
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
