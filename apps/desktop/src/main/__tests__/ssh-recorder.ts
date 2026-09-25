import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ShellSpawn } from "../ssh-run";

/**
 * An `ssh` that answers from a script: what it was given, and what it says
 * back, so the tests read as the dialogue they check.
 */

export interface Call {
  args: string[];
  stdin: string;
  env?: NodeJS.ProcessEnv;
}

export interface Answer {
  code: number;
  stderr?: string;
}

export function recorder(answers: Answer[]): {
  spawn: ShellSpawn;
  calls: Call[];
} {
  const calls: Call[] = [];

  const spawn: ShellSpawn = (_command, args, options) => {
    const child = new EventEmitter() as EventEmitter & {
      stdin: PassThrough;
      stdout: PassThrough;
      stderr: PassThrough;
      kill: () => void;
    };

    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => undefined;

    const call: Call = { args, env: options.env, stdin: "" };
    calls.push(call);

    child.stdin.on("data", (chunk: Buffer) => {
      call.stdin += chunk.toString("utf8");
    });

    child.stdin.on("finish", () => {
      const answer = answers.shift() ?? { code: 255 };

      if (answer.stderr) {
        child.stderr.write(answer.stderr);
      }

      setTimeout(() => child.emit("close", answer.code), 0);
    });

    return child as unknown as ChildProcess;
  };

  return { calls, spawn };
}
