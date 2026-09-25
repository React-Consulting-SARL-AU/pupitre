import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import type { CommandName } from "@pupitre/shared/agent-protocol";
import type { AgentSpawn } from "../../agent-client";

export interface EchoAgent {
  spawn: AgentSpawn;
  started: () => number;
  asked: () => CommandName[];
  /** Each command prefixed by its channel, e.g. `privileged install`. */
  routed: () => string[];
  killed: () => number;
  killAll: () => void;
}

/** Answers every command so a contract sweep is decided by the guard alone, never by a transcript's order. */
export function echoAgent(): EchoAgent {
  const asked: CommandName[] = [];
  const routed: string[] = [];
  const children: PassThrough[] = [];
  let killed = 0;

  return {
    spawn: ({ purpose }) => {
      const stdout = new PassThrough();
      const stderr = new PassThrough();

      const stdin = new Writable({
        write(chunk, _encoding, done) {
          for (const raw of String(chunk).split("\n")) {
            const line = raw.trim();

            if (line.length === 0) {
              continue;
            }

            const parsed = JSON.parse(line) as {
              id?: number;
              cmd?: CommandName;
            };

            if (typeof parsed.id !== "number" || !parsed.cmd) {
              continue;
            }

            asked.push(parsed.cmd);
            routed.push(`${purpose} ${parsed.cmd}`);
            stdout.write(
              `${JSON.stringify({ id: parsed.id, ok: true, result: {} })}\n`
            );
          }

          done();
        },
      });

      const proc: ChildProcess = Object.assign(new EventEmitter(), {
        exitCode: null,
        kill: () => {
          killed += 1;
          Object.assign(proc, { exitCode: 143 });
          proc.emit("close", 143);

          return true;
        },
        stderr,
        stdin,
        stdout,
      }) as unknown as ChildProcess;

      children.push(stdout);

      return proc;
    },
    started: () => children.length,
    asked: () => [...asked],
    routed: () => [...routed],
    killed: () => killed,
    killAll: () => {
      for (const stdout of children) {
        stdout.end();
      }
    },
  };
}
