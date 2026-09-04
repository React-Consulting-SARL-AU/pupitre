import { type ChildProcess, spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentSpawn } from "../../agent-client";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENTRY = join(HERE, "fake-agent-main.ts");

export type FakeAgent = {
  spawn: AgentSpawn;
  /** How many processes were started, and how many are still running. */
  started: () => number;
  live: () => number;
  /** The `id=… cmd=…` lines the agent saw, in order, all connections mixed. */
  trace: () => string[];
  killAll: () => void;
};

/**
 * A `pupitred serve` replaced by a Bun process replaying a transcript.
 *
 * One transcript per connection: a channel that reconnects after a cut gets the
 * next one, which is how the resume path is exercised without a network. The
 * last transcript serves any further connection.
 */
export function fakeAgent(fixtures: string | string[]): FakeAgent {
  const paths = (Array.isArray(fixtures) ? fixtures : [fixtures]).map((name) =>
    join(HERE, name)
  );
  const children: ChildProcess[] = [];
  const running = new Set<ChildProcess>();
  const traces: string[] = [];

  return {
    spawn: () => {
      const path = paths[Math.min(children.length, paths.length - 1)];
      const child = spawn(process.execPath, [ENTRY, path], {
        stdio: ["pipe", "pipe", "pipe"],
      });

      child.stderr?.setEncoding("utf8");
      child.stderr?.on("data", (chunk: string) => {
        for (const line of chunk.split("\n")) {
          if (line.trim().length > 0) {
            traces.push(line.trim());
          }
        }
      });

      running.add(child);
      child.on("exit", () => running.delete(child));

      children.push(child);

      return child;
    },
    started: () => children.length,
    live: () => running.size,
    trace: () => [...traces],
    killAll: () => {
      for (const child of children) {
        child.kill();
      }
    },
  };
}
