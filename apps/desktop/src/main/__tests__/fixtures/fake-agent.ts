import { type ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentSpawn, ChannelPurpose } from "../../agent-client";
import { LIMITED_FLAG, STATE_FLAG } from "./fake-agent-flags";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENTRY = join(HERE, "fake-agent-main.ts");

export interface FakeAgent {
  spawn: AgentSpawn;
  started: () => number;
  live: () => number;
  /** The `id=… cmd=…` lines the agent saw, in order, all connections mixed. */
  trace: () => string[];
  /** Every line the app wrote on the channel: requests and secret lines alike. */
  written: () => string[];
  purposes: () => ChannelPurpose[];
  killAll: () => void;
}

/** Proving a secret never entered `params` needs the bytes sent, not what the agent traced. */
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

/** One transcript per connection, so a reconnect after a cut replays the next; the last serves the rest. */
export function fakeAgent(fixtures: string | string[]): FakeAgent {
  const paths = (Array.isArray(fixtures) ? fixtures : [fixtures]).map((name) =>
    join(HERE, name)
  );
  const children: ChildProcess[] = [];
  const running = new Set<ChildProcess>();
  const traces: string[] = [];
  const sent: string[] = [];
  const purposes: ChannelPurpose[] = [];
  const state = join(tmpdir(), `pupitre-fake-agent-${randomUUID()}`);

  return {
    purposes: () => [...purposes],
    spawn: (context) => {
      const path = paths[Math.min(children.length, paths.length - 1)];
      const args = [ENTRY, path, `${STATE_FLAG}${state}`];

      if (context?.purpose !== "privileged") {
        args.push(LIMITED_FLAG);
      }

      purposes.push(context?.purpose ?? "control");

      const child = spawn(process.execPath, args, {
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

      rmSync(state, { force: true });
    },
  };
}
