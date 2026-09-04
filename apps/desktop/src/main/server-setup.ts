import type { KeyChoice, Server, ServerDraft } from "@shared/servers";
import { forgetHostKey } from "./host-keys";
import {
  copyIdCommand,
  generateKey,
  importKey,
  KeyError,
  removeKey,
} from "./keys";
import type { SshPaths } from "./ssh-config";

/**
 * Adding, pinning and removing a server, without ever leaving the app's folder.
 *
 * Three ways to give a key, and the difference between them is only who owns
 * the file: the app generates one, the app copies one in, or the app uses none
 * at all because the host already lives in the user's own configuration. That
 * last case is the only one where the app writes nothing, and it writes nothing
 * anywhere — no block, no key, no known_hosts entry.
 */

const HOST = /^[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?$/;
const USER = /^[a-z_][a-z0-9_-]{0,31}\$?$/i;
const MIN_PORT = 1;
const MAX_PORT = 65_535;
const NAME_LIMIT = 60;

export class SetupError extends Error {
  readonly fix: string;

  constructor(message: string, fix: string) {
    super(message);
    this.name = "SetupError";
    this.fix = fix;
  }
}

export interface ServerCreation {
  server: Server;
  servers: Server[];
  publicKey: string | null;
  copyId: string | null;
}

function refuse(condition: boolean, message: string, fix: string): void {
  if (!condition) {
    throw new SetupError(message, fix);
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
      throw new SetupError(cause.message, cause.fix);
    }
    throw cause;
  }
}

export async function addServer(
  draft: ServerDraft,
  servers: Server[],
  paths: SshPaths
): Promise<ServerCreation> {
  const fromSystem = draft.key.mode === "system";
  const host = (
    draft.key.mode === "system" ? draft.key.host : draft.host
  ).trim();
  const user = draft.user.trim();
  const name = draft.name.trim().slice(0, NAME_LIMIT) || host;

  refuse(
    HOST.test(host),
    `« ${host} » ne ressemble pas à une adresse de serveur.`,
    "Une adresse IP ou un nom d'hôte, sans espace ni ponctuation — « 203.0.113.10 » ou « vps.exemple.net »."
  );
  refuse(
    Number.isInteger(draft.port) &&
      draft.port >= MIN_PORT &&
      draft.port <= MAX_PORT,
    `Le port ${draft.port} n'existe pas.`,
    "Un port entre 1 et 65535 : 22 pour un serveur SSH ordinaire."
  );

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

  refuse(
    USER.test(user),
    `« ${user} » n'est pas un nom d'utilisateur.`,
    "Le compte à ouvrir sur le serveur : « root » au premier contact, « dev » une fois la machine durcie."
  );

  const pair = await keyFor(draft.key, id, paths);
  const server: Server = {
    host,
    id,
    keyPath: pair.keyPath,
    name,
    origin: "app",
    port: draft.port,
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
