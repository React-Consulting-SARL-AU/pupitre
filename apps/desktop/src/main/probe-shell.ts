import type { ProbeResult } from "@pupitre/shared/agent-protocol/install";
import { ProbeResultSchema } from "@pupitre/shared/agent-protocol/install";
import type { AgentResponse } from "@shared/agent";
import { refuseWith } from "./refusal";
import { lastLine, runSsh, type ShellSpawn } from "./ssh-run";
import { trace } from "./trace";

/**
 * The probe, on a machine that has no agent yet.
 *
 * `sh -s` reads the script on standard input and runs it from memory: nothing is
 * uploaded, nothing is written, nothing is left behind. A machine we were only
 * looking at must be exactly as it was once we have looked.
 */

export const PROBE_REMOTE_COMMAND = "sh -s";

const PROBE_TIMEOUT_MS = 30_000;

export interface ShellProbeOptions {
  /** What names the server: `-F <app config> <alias>`, or a system host. */
  args: string[];
  script: string;
  spawn?: ShellSpawn;
  timeoutMs?: number;
}

export function probeSshArgs(args: string[]): string[] {
  return ["-o", "BatchMode=yes", ...args, PROBE_REMOTE_COMMAND];
}

function unreachable(detail: string): AgentResponse<never> {
  return detail
    ? refuseWith("disconnected", "refusal.probe.failed.detail", { detail })
    : refuseWith("disconnected", "refusal.probe.failed");
}

function unreadable(): AgentResponse<never> {
  return refuseWith("internal", "refusal.probe.unreadable");
}

/**
 * The report, read back from the noise.
 *
 * A login banner, a `motd`, a warning from `sudo`: all of it lands on the same
 * stream as the report, and none of it is JSON. The last line that parses as a
 * probe is the report.
 */
function parse(output: string): ProbeResult | null {
  const lines = output
    .split("\n")
    .filter((line) => line.trim().startsWith("{"));

  for (const line of lines.reverse()) {
    let value: unknown;
    try {
      value = JSON.parse(line.trim());
    } catch {
      continue;
    }

    const parsed = ProbeResultSchema.safeParse(value);
    if (parsed.success) {
      return parsed.data;
    }
  }

  return null;
}

export async function runShellProbe({
  args,
  script,
  spawn,
  timeoutMs = PROBE_TIMEOUT_MS,
}: ShellProbeOptions): Promise<AgentResponse<ProbeResult>> {
  const run = await runSsh(probeSshArgs(args), {
    scope: "probe",
    spawn,
    stdin: script,
    timeoutMs,
  });

  if (run.status === "failed") {
    return unreachable(run.message);
  }

  if (run.status === "timeout") {
    return refuseWith("timeout", "refusal.probe.timeout", {
      seconds: Math.round(timeoutMs / 1000),
    });
  }

  const probe = parse(run.stdout);

  trace("probe", "done", {
    agent: probe?.agent_version ?? "none",
    modules: probe?.installed_modules.length ?? 0,
    read: Boolean(probe),
  });

  if (probe) {
    return { ok: true, result: probe };
  }

  return run.code === 0 ? unreadable() : unreachable(lastLine(run.stderr));
}
