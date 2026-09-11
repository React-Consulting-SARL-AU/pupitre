import type { CommandName } from "@pupitre/shared/agent-protocol";
import type { AccountResponse, UsageRight } from "@shared/account";
import type { AgentError, AgentResponse } from "@shared/agent";
import { asAgentError } from "./enrollment-run";

/**
 * The usage right in front of the channels.
 *
 * A subscription that stopped closes the app, not only the enrolment. The guard
 * is not held channel by channel — a channel written tomorrow would forget it —
 * but at the one doorway they all use, `agent-client.ts`: every command that
 * makes a server act is refused there and never reaches the agent. Reading
 * stays open, the machine has to remain visible while the account is repaired,
 * and nothing that runs on it is stopped by this path, because nothing is sent.
 *
 * The list below is what may be read. Anything else is held to act, so a
 * command added to the contract is guarded until it is declared otherwise.
 */
export const READING_COMMANDS: ReadonlySet<CommandName> = new Set([
  "hello",
  "ping",
  "probe",
  "catalog",
  "module.config",
  "report",
  "snapshot",
  "status",
  "service.status",
  "service.secret",
  "service.logs",
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
  "fs.list",
  "fs.stat",
  "fs.read",
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

/** The guard's refusal, in the words the agent's own errors are read with. */
export function usageError(guard: UsageGuard): AgentError | null {
  const allowed = guard();

  return allowed.ok ? null : asAgentError(allowed.error);
}

/** That same refusal in the envelope the bridge carries, or nothing. */
export function usageRefusal(guard: UsageGuard): AgentResponse<never> | null {
  const error = usageError(guard);

  return error ? { ok: false, error } : null;
}
