import type { CommandName } from "@pupitre/shared/agent-protocol";
import {
  DB_ENGINES,
  type DbEngine,
} from "@pupitre/shared/agent-protocol/secrets";
import type { ServiceState } from "@pupitre/shared/agent-protocol/state";

/**
 * What the Services screen is allowed to know about a module it did not ask to
 * install.
 *
 * The state, the version, the port and the unit are the agent's own words. The
 * credentials are named and nothing more: their values stay in the main
 * process, which shows one at a time on demand and copies it without ever
 * handing it to the renderer.
 */
export interface ServiceDetail {
  id: string;
  name: string;
  state: ServiceState;
  /** False for a module put on the machine with its questions left unanswered. */
  configured: boolean;
  version?: string;
  port?: number;
  unit?: string;
  /** The labels the agent gave, in its order. Never a value. */
  credentials: string[];
}

/**
 * The commands that answer with a credential.
 *
 * They do not cross the generic bridge: `service.status` and `db.url` answer
 * with what opens a database, and a renderer that could call them itself would
 * hold that answer in a store — which is the one place it must never be.
 * `service.secret` carries its value on an event rather than in its result, and
 * belongs here for the same reason: it is read in the main process, or nowhere.
 */
export const CREDENTIAL_COMMANDS = [
  "service.status",
  "db.url",
  "service.secret",
] as const satisfies readonly CommandName[];

export function carriesCredential(cmd: string): boolean {
  return (CREDENTIAL_COMMANDS as readonly string[]).includes(cmd);
}

/** The label the connection string is filed under, alongside the agent's own. */
/** A sentinel, not prose: the screen translates it, the vault keys on it. */
export const CONNECTION_LABEL = "connection-url";

/**
 * The engine a module drives, read off its identifier.
 *
 * `db.postgres` is the postgres engine because the catalogue names modules
 * `<category>.<engine>` and the protocol closes the list of engines: a module
 * whose suffix is not one of them simply has no database actions.
 */
export function databaseEngineOf(moduleId: string): DbEngine | null {
  const [category, engine] = moduleId.split(".");

  return category === "db" &&
    (DB_ENGINES as readonly string[]).includes(engine ?? "")
    ? (engine as DbEngine)
    : null;
}

/**
 * A port of the server, reachable from this computer for as long as the
 * forward is open. Nothing listens on the server's side that was not already
 * listening: the tunnel is the app's own `ssh -L`.
 */
export interface PortForward {
  id: string;
  serverId: string;
  remotePort: number;
  localPort: number;
  /** What it was opened for — a module identifier, or a bare port. */
  label: string;
  /** The local port this forward took last time, when something else held it now. */
  movedFrom?: number;
}

/**
 * A database shell the main process has opened the way to.
 *
 * The renderer named a module; the command the agent composed for it stays on
 * the other side of the bridge, under the identifier of the tab that will run
 * it. What crosses is that identifier and the tmux session it attaches to.
 */
export interface DatabaseShell {
  id: string;
  session: string;
}
