import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import type { CommandName } from "@pupitre/shared/agent-protocol";
import type { AgentSpawn } from "../../agent-client";

export interface EchoAgent {
  spawn: AgentSpawn;
  started: () => number;
  /** The commands that actually reached an agent, in order. */
  asked: () => CommandName[];
  killAll: () => void;
}

/**
 * An agent that answers anything, in this process.
 *
 * A transcript pins an order, which is what makes it useful; sweeping the whole
 * contract needs the opposite — something that answers every command — so that
 * what goes through and what does not is decided by the guard alone and never
 * by the fixture.
 */
export function echoAgent(): EchoAgent {
  const asked: CommandName[] = [];
  const children: PassThrough[] = [];

  return {
    spawn: () => {
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
            stdout.write(
              `${JSON.stringify({ id: parsed.id, ok: true, result: {} })}\n`
            );
          }

          done();
        },
      });

      const proc = Object.assign(new EventEmitter(), {
        exitCode: null,
        kill: () => true,
        stderr,
        stdin,
        stdout,
      }) as unknown as ChildProcess;

      children.push(stdout);

      return proc;
    },
    started: () => children.length,
    asked: () => [...asked],
    killAll: () => {
      for (const stdout of children) {
        stdout.end();
      }
    },
  };
}
