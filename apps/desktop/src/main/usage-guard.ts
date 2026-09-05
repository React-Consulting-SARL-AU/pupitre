import type {
  CommandName,
  CommandParams,
  CommandResult,
} from "@pupitre/shared/agent-protocol";
import type { AccountResponse, UsageRight } from "@shared/account";
import type { AgentResponse } from "@shared/agent";
import type { AgentClient, CallOptions } from "./agent-client";
import { asAgentError } from "./enrollment-run";

/**
 * The usage right in front of the channels.
 *
 * A subscription that stopped closes the app, not only the enrolment: every
 * command that makes a server act goes through the guard first, and never
 * reaches the channel. Reading stays open — the machine has to remain visible
 * while the account is repaired — and nothing that runs on it is stopped by
 * this path, because nothing is sent.
 *
 * The list below is what may be read. Anything else is held to act, so a
 * command added to the contract is guarded until it is declared otherwise.
 */
export const READING_COMMANDS: ReadonlySet<CommandName> = new Set([
  "hello",
  "ping",
  "probe",
  "catalog",
  "report",
  "snapshot",
  "status",
  "service.status",
  "service.secret",
  "completions",
  "project.list",
  "project.logs",
  "project.branches",
  "project.git_status",
  "project.working_tree",
  "project.diff",
  "project.url",
  "sessions.list",
  "processes.list",
  "shots.list",
  "shots.url",
  "shots.read",
  "secrets.status",
  "db.url",
  "tunnel.status",
  "keys.list",
  "doctor",
  "diag",
]);

export type UsageGuard = () => AccountResponse<UsageRight>;

export function mutates(cmd: CommandName): boolean {
  return !READING_COMMANDS.has(cmd);
}

/** The guard's refusal in the envelope the bridge carries, or nothing. */
export function usageRefusal(guard: UsageGuard): AgentResponse<never> | null {
  const allowed = guard();

  return allowed.ok ? null : { ok: false, error: asAgentError(allowed.error) };
}

export function guardedRequest<C extends CommandName>(
  client: Pick<AgentClient, "request">,
  guard: UsageGuard,
  serverId: string,
  cmd: C,
  params?: CommandParams<C>,
  options?: CallOptions
): Promise<AgentResponse<CommandResult<C>>> {
  const refused = mutates(cmd) ? usageRefusal(guard) : null;

  return refused
    ? Promise.resolve(refused)
    : client.request(serverId, cmd, params, options);
}
