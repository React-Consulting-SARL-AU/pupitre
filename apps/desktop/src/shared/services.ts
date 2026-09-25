import type { CommandName } from "@pupitre/shared/agent-protocol";
import {
  DB_ENGINES,
  type DbEngine,
} from "@pupitre/shared/agent-protocol/secrets";
import type { Login, ServiceState } from "@pupitre/shared/agent-protocol/state";

export interface ServiceDetail {
  id: string;
  name: string;
  state: ServiceState;
  /** False for a module put on the machine with its questions left unanswered. */
  configured: boolean;
  version?: string;
  port?: number;
  unit?: string;
  /** Labels only, never a value: values stay in the main process and are copied from there. */
  credentials: string[];
  login?: Login;
}

/** Kept off the generic bridge: a renderer calling them would hold a credential in a store. */
export const CREDENTIAL_COMMANDS = [
  "service.status",
  "db.url",
  "service.secret",
] as const satisfies readonly CommandName[];

export function carriesCredential(cmd: string): boolean {
  return (CREDENTIAL_COMMANDS as readonly string[]).includes(cmd);
}

/** A sentinel, not prose: the screen translates it, the vault keys on it. */
export const CONNECTION_LABEL = "connection-url";

/** The catalogue names modules `<category>.<engine>` and the protocol closes the list of engines. */
export function databaseEngineOf(moduleId: string): DbEngine | null {
  const [category, engine] = moduleId.split(".");

  return category === "db" &&
    (DB_ENGINES as readonly string[]).includes(engine ?? "")
    ? (engine as DbEngine)
    : null;
}

export interface PortForward {
  id: string;
  serverId: string;
  remotePort: number;
  localPort: number;
  /** A module identifier, or a bare port. */
  label: string;
  /** The local port this forward took last time, when something else held it now. */
  movedFrom?: number;
}

/** The shell command the agent composed stays in the main process; only the tab id and tmux session cross. */
export interface DatabaseShell {
  id: string;
  session: string;
}
