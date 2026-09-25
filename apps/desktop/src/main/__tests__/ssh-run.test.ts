import { describe, expect, it } from "bun:test";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { lastLine, runSsh, type ShellSpawn } from "../ssh-run";

type Fake = EventEmitter & {
  stdin: PassThrough;
  stdout: PassThrough;
  stderr: PassThrough;
  kill: () => void;
  killed: boolean;
};

function child(): Fake {
  const made = new EventEmitter() as Fake;

  made.stdin = new PassThrough();
  made.stdout = new PassThrough();
  made.stderr = new PassThrough();
  made.killed = false;
  made.kill = () => {
    made.killed = true;
  };

  return made;
}

function answering(
  write: (made: Fake) => void,
  code: number | null = 0
): { spawn: ShellSpawn; made: Fake } {
  const made = child();

  made.stdin.on("finish", () => {
    write(made);
    setTimeout(() => made.emit("close", code), 5);
  });

  return { made, spawn: () => made as unknown as ChildProcess };
}

describe("un ssh court", () => {
  it("rend ce qu'il a écrit et son code", async () => {
    const { spawn } = answering((made) => {
      made.stdout.write("abc  /tmp/pupitred\n");
      made.stderr.write("Warning: added\nPermission denied\n");
    }, 1);

    const run = await runSsh(["host", "true"], {
      scope: "test",
      spawn,
      timeoutMs: 1000,
    });

    expect(run).toEqual({
      code: 1,
      status: "exited",
      stderr: "Warning: added\nPermission denied\n",
      stdout: "abc  /tmp/pupitred\n",
    });
    expect(lastLine(run.status === "exited" ? run.stderr : "")).toBe(
      "Permission denied"
    );
  });

  it("ne garde que la fin d'une sortie qui déborde", async () => {
    const { spawn } = answering((made) => {
      made.stdout.write("x".repeat(5000));
      made.stdout.write("\nla fin\n");
    });

    const run = await runSsh(["host"], {
      limit: 100,
      scope: "test",
      spawn,
      timeoutMs: 1000,
    });

    expect(run.status === "exited" && run.stdout.length).toBe(100);
    expect(run.status === "exited" && run.stdout.endsWith("la fin\n")).toBe(
      true
    );
  });

  it("tue ce qui ne répond pas et le dit", async () => {
    const made = child();

    const run = await runSsh(["host"], {
      scope: "test",
      spawn: () => made as unknown as ChildProcess,
      timeoutMs: 10,
    });

    expect(run.status).toBe("timeout");
    expect(made.killed).toBe(true);
  });
});
