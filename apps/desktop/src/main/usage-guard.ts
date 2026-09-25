import type { CommandName } from "@pupitre/shared/agent-protocol";
import type { AccountResponse, UsageRight } from "@shared/account";
import type { AgentError, AgentResponse } from "@shared/agent";
import { asAgentError } from "./enrollment-run";

/** Allow-list of reads: any command added to the contract is guarded until declared here. */
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
  "backup.status",
  "backup.contents",
  "keys.list",
  "doctor",
  "diag",
]);

export type UsageGuard = () => AccountResponse<UsageRight>;

export function mutates(cmd: CommandName): boolean {
  return !READING_COMMANDS.has(cmd);
}

export function usageError(guard: UsageGuard): AgentError | null {
  const allowed = guard();

  return allowed.ok ? null : asAgentError(allowed.error);
}

export function usageRefusal(guard: UsageGuard): AgentResponse<never> | null {
  const error = usageError(guard);

  return error ? { ok: false, error } : null;
}
