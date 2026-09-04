import { afterEach, describe, expect, it } from "bun:test";
import type { ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { agentFileName, embedAgent } from "../../../scripts/embed-agent";
import {
  AGENT_INSTALL_COMMAND,
  agentPayload,
  agentSshArgs,
  type ShellSpawn,
  sendAgentBinary,
} from "../agent-binary";

const AMD64 = "le binaire linux-amd64, en faux";
const ARM64 = "le binaire linux-arm64, en faux";

const SSH_ARGS = ["-F", "/tmp/pupitre/ssh/config", "pupitre-srv-1"];

const made: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "pupitre-agent-"));
  made.push(dir);

  return dir;
}

function builtAgent(): string {
  const dist = tempDir();
  writeFileSync(join(dist, agentFileName("amd64")), AMD64);
  writeFileSync(join(dist, agentFileName("arm64")), ARM64);

  return dist;
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

afterEach(() => {
  for (const dir of made.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});

type Call = { command: string; args: string[]; stdin: Buffer; ended: boolean };

function recorder(
  reply: (call: Call) => { out?: string; err?: string; code?: number }
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

    const call: Call = { args, command, ended: false, stdin: Buffer.alloc(0) };
    calls.push(call);

    child.stdin.on("data", (chunk: Buffer) => {
      call.stdin = Buffer.concat([call.stdin, chunk]);
    });
    child.stdin.on("finish", () => {
      call.ended = true;

      const answer = reply(call);
      setTimeout(() => {
        child.stdout.write(answer.out ?? "");
        child.stderr.write(answer.err ?? "");
        child.emit("close", answer.code ?? 0);
      }, 0);
    });

    return child as unknown as ChildProcess;
  };

  return { calls, spawn };
}

describe("le binaire embarqué dans l'app", () => {
  it("est copié depuis la construction de l'agent, exécutable", () => {
    const resources = tempDir();

    const result = embedAgent({ from: builtAgent(), to: resources });

    for (const arch of ["amd64", "arm64"]) {
      const file = join(resources, agentFileName(arch));

      expect(existsSync(file)).toBe(true);
      expect(statSync(file).mode & 0o111).toBe(0o111);
    }
    expect(result.missing).toEqual([]);
  });

  it("écrit la somme de contrôle de ce qu'il a copié", () => {
    const resources = tempDir();

    const result = embedAgent({ from: builtAgent(), to: resources });
    const manifest = JSON.parse(
      readFileSync(join(resources, "manifest.json"), "utf8")
    );

    expect(manifest.binaries.amd64.sha256).toBe(digest(AMD64));
    expect(manifest.binaries.arm64.sha256).toBe(digest(ARM64));
    expect(manifest.binaries.amd64.bytes).toBe(Buffer.byteLength(AMD64));
    expect(result.manifest).toEqual(manifest);
  });

  it("ne laisse pas un manifeste périmé quand l'agent n'est pas construit", () => {
    const resources = tempDir();
    embedAgent({ from: builtAgent(), to: resources });

    const result = embedAgent({ from: tempDir(), to: resources });

    expect(result.manifest).toBeNull();
    expect(result.missing).toEqual(["amd64", "arm64"]);
    expect(existsSync(join(resources, "manifest.json"))).toBe(false);
  });
});

describe("le binaire choisi pour la machine", () => {
  it("suit l'architecture que la sonde a rapportée", () => {
    const resources = tempDir();
    embedAgent({ from: builtAgent(), to: resources });

    const answer = agentPayload(resources, "arm64");

    expect(answer.ok && answer.result.arch).toBe("arm64");
    expect(answer.ok && answer.result.content.toString()).toBe(ARM64);
    expect(answer.ok && answer.result.sha256).toBe(digest(ARM64));
  });

  it("dit clairement qu'il n'y a pas de binaire, plutôt que d'échouer plus loin", () => {
    const answer = agentPayload(tempDir(), "amd64");

    expect(answer).toMatchObject({ ok: false, error: { code: "internal" } });
    expect(answer.ok).toBe(false);
    if (!answer.ok) {
      expect(answer.error.message).toContain("amd64");
      expect(answer.error.fix).toContain("apps/agent");
    }
  });

  it("nomme l'architecture que l'app ne porte pas", () => {
    const resources = tempDir();
    embedAgent({ from: builtAgent(), to: resources });

    const answer = agentPayload(resources, "i686");

    expect(answer.ok).toBe(false);
    if (!answer.ok) {
      expect(answer.error.message).toContain("i686");
    }
  });

  it("refuse un binaire qui ne correspond plus à sa somme de contrôle", () => {
    const resources = tempDir();
    embedAgent({ from: builtAgent(), to: resources });
    const file = join(resources, agentFileName("amd64"));
    writeFileSync(file, "un binaire remplacé après coup");
    chmodSync(file, 0o755);

    const answer = agentPayload(resources, "amd64");

    expect(answer.ok).toBe(false);
    if (!answer.ok) {
      expect(answer.error.message).toContain("somme de contrôle");
    }
  });
});

describe("l'envoi du binaire par le canal SSH", () => {
  it("pousse les octets sur l'entrée standard et vérifie l'empreinte reçue", async () => {
    const resources = tempDir();
    embedAgent({ from: builtAgent(), to: resources });
    const payload = agentPayload(resources, "amd64");

    if (!payload.ok) {
      throw new Error("le binaire embarqué manque");
    }

    const { calls, spawn } = recorder(() => ({
      out: `${digest(AMD64)}  /usr/local/bin/.pupitred.new\n`,
    }));

    const answer = await sendAgentBinary({
      args: SSH_ARGS,
      payload: payload.result,
      spawn,
    });

    expect(answer).toMatchObject({
      ok: true,
      result: { arch: "amd64", sha256: digest(AMD64) },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].command).toBe("ssh");
    expect(calls[0].args).toEqual(agentSshArgs(SSH_ARGS));
    expect(calls[0].args.at(-1)).toBe(AGENT_INSTALL_COMMAND);
    expect(calls[0].stdin.toString()).toBe(AMD64);
    expect(calls[0].ended).toBe(true);
  });

  it("refuse un serveur qui n'a pas reçu les mêmes octets", async () => {
    const resources = tempDir();
    embedAgent({ from: builtAgent(), to: resources });
    const payload = agentPayload(resources, "amd64");

    if (!payload.ok) {
      throw new Error("le binaire embarqué manque");
    }

    const { spawn } = recorder(() => ({
      out: `${digest("autre chose")}  /usr/local/bin/.pupitred.new\n`,
    }));

    const answer = await sendAgentBinary({
      args: SSH_ARGS,
      payload: payload.result,
      spawn,
    });

    expect(answer.ok).toBe(false);
    if (!answer.ok) {
      expect(answer.error.message).toContain("somme de contrôle");
      expect(answer.error.fix).toBeTruthy();
    }
  });

  it("remonte ce que le serveur a dit quand l'envoi échoue", async () => {
    const resources = tempDir();
    embedAgent({ from: builtAgent(), to: resources });
    const payload = agentPayload(resources, "amd64");

    if (!payload.ok) {
      throw new Error("le binaire embarqué manque");
    }

    const { spawn } = recorder(() => ({
      code: 1,
      err: "install: cannot create '/usr/local/bin/.pupitred.new': Permission denied\n",
    }));

    const answer = await sendAgentBinary({
      args: SSH_ARGS,
      payload: payload.result,
      spawn,
    });

    expect(answer.ok).toBe(false);
    if (!answer.ok) {
      expect(answer.error.message).toContain("Permission denied");
    }
  });
});

describe("la construction de l'app", () => {
  it("range le binaire là où le processus principal le cherche", () => {
    const resources = join(tempDir(), "agent");
    mkdirSync(resources, { recursive: true });

    embedAgent({ from: builtAgent(), to: resources });

    expect(existsSync(join(resources, "manifest.json"))).toBe(true);
    expect(agentPayload(resources, "amd64").ok).toBe(true);
  });
});
