import {
  type ChildProcess,
  type SpawnOptions,
  spawn as spawnChild,
} from "node:child_process";
import { trace } from "./trace";

export type ShellSpawn = (
  command: string,
  args: string[],
  options: SpawnOptions
) => ChildProcess;

export const OUTPUT_LIMIT = 256 * 1024;

export type SshRun =
  | { status: "exited"; code: number | null; stdout: string; stderr: string }
  | { status: "timeout"; stdout: string; stderr: string }
  | { status: "failed"; message: string };

export interface SshRunOptions {
  stdin?: string | Buffer;
  env?: NodeJS.ProcessEnv;
  spawn?: ShellSpawn;
  timeoutMs: number;
  /** The trace names the run by this and never records the input. */
  scope: string;
  limit?: number;
}

/** A flood never fills the main process, and the lines that say how ssh ended come last anyway. */
function tail(held: string, chunk: string, limit: number): string {
  const joined = held + chunk;

  return joined.length > limit ? joined.slice(joined.length - limit) : joined;
}

/** The last line of what `ssh` complained about, which is the one that names it. */
export function lastLine(stderr: string): string {
  return (
    stderr
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .at(-1) ?? ""
  );
}

export function runSsh(
  args: string[],
  {
    stdin,
    env,
    spawn = spawnChild as ShellSpawn,
    timeoutMs,
    scope,
    limit = OUTPUT_LIMIT,
  }: SshRunOptions
): Promise<SshRun> {
  return new Promise((resolve) => {
    trace(scope, "ssh", { args });

    const child = spawn("ssh", args, {
      ...(env ? { env } : {}),
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    function settle(run: SshRun): void {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      trace(scope, "ssh.done", {
        status: run.status,
        ...(run.status === "exited" ? { code: run.code } : {}),
        ...(run.status !== "failed" && run.stderr
          ? { stderr: lastLine(run.stderr) }
          : {}),
      });
      resolve(run);
    }

    const timer = setTimeout(() => {
      child.kill();
      settle({ status: "timeout", stderr, stdout });
    }, timeoutMs);

    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout = tail(stdout, chunk, limit);
    });
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      stderr = tail(stderr, chunk, limit);
    });

    child.on("error", (error: Error) =>
      settle({ message: error.message, status: "failed" })
    );
    child.on("close", (code: number | null) =>
      settle({ code, status: "exited", stderr, stdout })
    );

    child.stdin?.end(stdin ?? "");
  });
}
