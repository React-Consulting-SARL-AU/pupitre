import type { ProbeResult } from "@pupitre/shared/agent-protocol/install";
import { ProbeResultSchema } from "@pupitre/shared/agent-protocol/install";
import type { AgentResponse } from "@shared/agent";
import { refuseWith } from "./refusal";
import { lastLine, runSsh, type ShellSpawn } from "./ssh-run";
import { trace } from "./trace";

/** `sh -s` runs the script from stdin: probing a machine must leave nothing written on it. */
export const PROBE_REMOTE_COMMAND = "sh -s";

const PROBE_TIMEOUT_MS = 30_000;

export interface ShellProbeOptions {
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

/** A login banner, a motd or a `sudo` warning share stdout with the report: the last probe line wins. */
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
