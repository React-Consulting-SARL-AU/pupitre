import { describe, expect, it } from "bun:test";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import {
  PROBE_REMOTE_COMMAND,
  probeSshArgs,
  runShellProbe,
} from "../probe-shell";
import type { ShellSpawn } from "../ssh-run";

const HERE = dirname(fileURLToPath(import.meta.url));
const DESKTOP = join(HERE, "..", "..", "..");
const AGENT_PROBE = join(
  DESKTOP,
  "..",
  "agent",
  "internal",
  "probe",
  "probe.sh"
);
const EMBEDDED_PROBE = join(DESKTOP, "resources", "probe.sh");

const SSH_ARGS = ["-F", "/tmp/pupitre/ssh/config", "pupitre-srv-1"];

const BARE = {
  os: "ubuntu",
  version: "24.04",
  arch: "amd64",
  ram_mb: 8192,
  disk_free_gb: 38.4,
  sudo: true,
  ports: [],
  docker: false,
  panel: null,
  agent_version: null,
  installed_modules: [],
  verdict: {
    level: "ready",
    kind: "bare",
    reasons: ["Machine nue : ubuntu 24.04 amd64, 8192 Mo de mémoire."],
    fixes: [],
  },
};

type Call = { command: string; args: string[]; stdin: string; ended: boolean };

function recorder(
  reply: (call: Call) => { out?: string; err?: string; code?: number } | null
): { spawn: ShellSpawn; calls: Call[] } {
  const calls: Call[] = [];

  const spawn: ShellSpawn = (command, args) => {
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

    const call: Call = { args, command, ended: false, stdin: "" };

    calls.push(call);

    child.stdin.on("data", (chunk: Buffer) => {
      call.stdin += chunk.toString("utf8");
    });

    child.stdin.on("finish", () => {
      call.ended = true;

      const answer = reply(call);

      if (!answer) {
        return;
      }

      if (answer.out) {
        child.stdout.write(answer.out);
      }

      if (answer.err) {
        child.stderr.write(answer.err);
      }

      setTimeout(() => child.emit("close", answer.code ?? 0), 0);
    });

    return child as unknown as ChildProcess;
  };

  return { calls, spawn };
}

describe("la sonde envoyée par SSH", () => {
  it("n'exécute que `sh -s`, avec le script sur l'entrée standard", async () => {
    const script = readFileSync(EMBEDDED_PROBE, "utf8");
    const { calls, spawn } = recorder(() => ({
      out: `${JSON.stringify(BARE)}\n`,
    }));

    const answer = await runShellProbe({ args: SSH_ARGS, script, spawn });

    expect(answer).toMatchObject({ ok: true });
    expect(calls).toHaveLength(1);

    const call = calls[0];

    expect(call.command).toBe("ssh");
    expect(call.args).toEqual([
      "-o",
      "BatchMode=yes",
      "-F",
      "/tmp/pupitre/ssh/config",
      "pupitre-srv-1",
      "sh -s",
    ]);
    expect(call.args.at(-1)).toBe(PROBE_REMOTE_COMMAND);
    expect(call.stdin).toBe(script);
    expect(call.ended).toBe(true);
  });

  it("n'écrit rien sur le serveur : aucune copie, aucune redirection, aucun fichier", async () => {
    const { calls, spawn } = recorder(() => ({
      out: `${JSON.stringify(BARE)}\n`,
    }));

    await runShellProbe({ args: SSH_ARGS, script: "echo hi\n", spawn });

    const remote = calls[0].args.slice(2).join(" ");

    expect(remote).toBe("-F /tmp/pupitre/ssh/config pupitre-srv-1 sh -s");
    for (const forbidden of [
      ">",
      "scp",
      "sftp",
      "mktemp",
      "tee",
      "install",
      "chmod",
      "curl",
      "wget",
    ]) {
      expect(remote).not.toContain(forbidden);
    }
  });

  it("garde le rapport tel quel, bannière de connexion comprise", async () => {
    const { spawn } = recorder(() => ({
      out: `Welcome to Ubuntu 24.04 LTS\n{"not":"a probe"}\n${JSON.stringify(BARE)}\n`,
    }));

    const answer = await runShellProbe({
      args: SSH_ARGS,
      script: "true\n",
      spawn,
    });

    expect(answer).toEqual({ ok: true, result: BARE as never });
  });

  it("rend l'erreur de ssh et son remède quand la connexion échoue", async () => {
    const { spawn } = recorder(() => ({
      code: 255,
      err: "ssh: connect to host 10.0.0.9 port 22: Connection refused\n",
    }));

    const answer = await runShellProbe({
      args: SSH_ARGS,
      script: "true\n",
      spawn,
    });

    expect(answer).toMatchObject({
      ok: false,
      error: { code: "disconnected" },
    });
    expect(
      answer.ok === false && answer.error.phrase?.values?.detail
    ).toContain("Connection refused");
  });

  it("le dit quand la sortie n'est pas un rapport", async () => {
    const { spawn } = recorder(() => ({ out: "sh: 1: awk: not found\n" }));

    const answer = await runShellProbe({
      args: SSH_ARGS,
      script: "true\n",
      spawn,
    });

    expect(answer).toMatchObject({
      ok: false,
      error: { code: "internal" },
    });
    expect(answer.ok === false && answer.error.phrase?.id).toBe(
      "refusal.probe.unreadable"
    );
  });

  it("abandonne après le délai, sans laisser le processus derrière", async () => {
    let killed = false;
    const spawn: ShellSpawn = () => {
      const child = new EventEmitter() as EventEmitter & {
        stdin: PassThrough;
        stdout: PassThrough;
        stderr: PassThrough;
        kill: () => void;
      };

      child.stdin = new PassThrough();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.kill = () => {
        killed = true;
      };

      return child as unknown as ChildProcess;
    };

    const answer = await runShellProbe({
      args: SSH_ARGS,
      script: "true\n",
      spawn,
      timeoutMs: 20,
    });

    expect(answer).toMatchObject({ ok: false, error: { code: "timeout" } });
    expect(killed).toBe(true);
  });
});

describe("la sonde embarquée", () => {
  it("est le fichier de l'agent, octet pour octet", () => {
    expect(readFileSync(EMBEDDED_PROBE, "utf8")).toBe(
      readFileSync(AGENT_PROBE, "utf8")
    );
  });

  it("part sur `sh -s` et nulle part ailleurs", () => {
    expect(probeSshArgs(["staging"])).toEqual([
      "-o",
      "BatchMode=yes",
      "staging",
      "sh -s",
    ]);
  });
});
