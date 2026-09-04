import { type ChildProcess, spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentSpawn } from "../../agent-client";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENTRY = join(HERE, "fake-agent-main.ts");

export interface FakeAgent {
  spawn: AgentSpawn;
  /** How many processes were started, and how many are still running. */
  started: () => number;
  live: () => number;
  /** The `id=… cmd=…` lines the agent saw, in order, all connections mixed. */
  trace: () => string[];
  /** Every line the app wrote on the channel: requests and secret lines alike. */
  written: () => string[];
  killAll: () => void;
}

/**
 * A `pupitred serve` replaced by a Bun process replaying a transcript.
 *
 * One transcript per connection: a channel that reconnects after a cut gets the
 * next one, which is how the resume path is exercised without a network. The
 * last transcript serves any further connection.
 */
/**
 * Everything the app writes on the channel, kept as it goes out.
 *
 * A test that has to prove a secret never entered `params` needs the bytes
 * themselves, not what the agent chose to trace on the other side.
 */
function watchStdin(child: ChildProcess, sent: string[]): void {
  const stdin = child.stdin;

  if (!stdin) {
    return;
  }

  const write = stdin.write.bind(stdin);

  stdin.write = ((chunk: unknown, ...rest: unknown[]) => {
    for (const line of String(chunk).split("\n")) {
      if (line.trim().length > 0) {
        sent.push(line.trim());
      }
    }

    return (write as (...args: unknown[]) => boolean)(chunk, ...rest);
  }) as typeof stdin.write;
}

export function fakeAgent(fixtures: string | string[]): FakeAgent {
  const paths = (Array.isArray(fixtures) ? fixtures : [fixtures]).map((name) =>
    join(HERE, name)
  );
  const children: ChildProcess[] = [];
  const running = new Set<ChildProcess>();
  const traces: string[] = [];
  const sent: string[] = [];

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

      watchStdin(child, sent);

      running.add(child);
      child.on("exit", () => running.delete(child));

      children.push(child);

      return child;
    },
    started: () => children.length,
    live: () => running.size,
    trace: () => [...traces],
    written: () => [...sent],
    killAll: () => {
      for (const child of children) {
        child.kill();
      }
    },
  };
}
