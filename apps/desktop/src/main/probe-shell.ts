import { type ChildProcess, spawn as spawnChild } from "node:child_process";
import type { ProbeResult } from "@pupitre/shared/agent-protocol/install";
import { ProbeResultSchema } from "@pupitre/shared/agent-protocol/install";
import type { AgentResponse } from "@shared/agent";

/**
 * The probe, on a machine that has no agent yet.
 *
 * `sh -s` reads the script on standard input and runs it from memory: nothing is
 * uploaded, nothing is written, nothing is left behind. A machine we were only
 * looking at must be exactly as it was once we have looked.
 */

export const PROBE_REMOTE_COMMAND = "sh -s";

const PROBE_TIMEOUT_MS = 30_000;

export type ShellSpawn = (command: string, args: string[]) => ChildProcess;

export type ShellProbeOptions = {
  /** What names the server: `-F <app config> <alias>`, or a system host. */
  args: string[];
  script: string;
  spawn?: ShellSpawn;
  timeoutMs?: number;
};

function defaultSpawn(command: string, args: string[]): ChildProcess {
  return spawnChild(command, args, { stdio: ["pipe", "pipe", "pipe"] });
}

export function probeSshArgs(args: string[]): string[] {
  return ["-o", "BatchMode=yes", ...args, PROBE_REMOTE_COMMAND];
}

function unreachable(detail: string): AgentResponse<never> {
  return {
    ok: false,
    error: {
      code: "disconnected",
      message: detail
        ? `La sonde n'a pas pu s'exécuter sur le serveur : ${detail}`
        : "La sonde n'a pas pu s'exécuter sur le serveur.",
      fix: "Vérifie que le serveur répond en SSH, puis relance l'inspection.",
    },
  };
}

function unreadable(): AgentResponse<never> {
  return {
    ok: false,
    error: {
      code: "internal",
      message: "La sonde n'a pas renvoyé de rapport lisible.",
      fix: "Relance l'inspection ; si le serveur répond avec une bannière, retire-la du profil de connexion.",
    },
  };
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

export function runShellProbe({
  args,
  script,
  spawn = defaultSpawn,
  timeoutMs = PROBE_TIMEOUT_MS,
}: ShellProbeOptions): Promise<AgentResponse<ProbeResult>> {
  return new Promise((resolve) => {
    const child = spawn("ssh", probeSshArgs(args));

    let out = "";
    let err = "";
    let settled = false;

    function settle(answer: AgentResponse<ProbeResult>): void {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(answer);
    }

    const timer = setTimeout(() => {
      child.kill();
      settle({
        ok: false,
        error: {
          code: "timeout",
          message: `La sonde n'a pas répondu en ${Math.round(timeoutMs / 1000)} s.`,
          fix: "Relance l'inspection, ou vérifie la latence de la connexion au serveur.",
        },
      });
    }, timeoutMs);

    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      out += chunk;
    });
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      err += chunk;
    });

    child.on("error", (error: Error) => settle(unreachable(error.message)));

    child.on("close", (code: number | null) => {
      const probe = parse(out);

      if (probe) {
        settle({ ok: true, result: probe });
        return;
      }

      settle(
        code === 0
          ? unreadable()
          : unreachable(err.trim().split("\n").at(-1) ?? "")
      );
    });

    child.stdin?.end(script);
  });
}
