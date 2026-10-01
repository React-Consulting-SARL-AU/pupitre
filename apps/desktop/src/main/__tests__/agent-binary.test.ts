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
  AGENT_REMOTE_PATH,
  agentPayload,
  agentSshArgs,
  carriedRelease,
  installCommandAs,
  sendAgentBinary,
} from "../agent-binary";
import type { ShellSpawn } from "../ssh-run";

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

function publishedAgent(): string {
  const dist = builtAgent();

  writeFileSync(
    join(dist, "release.json"),
    JSON.stringify({
      notes: ["Retour arrière si la nouvelle version ne répond pas."],
      signatures: { amd64: "c2lnbmF0dXJlLWFtZDY0" },
      version: "0.4.0",
    })
  );

  return dist;
}

function embedded(from: string): string {
  const resources = join(tempDir(), "agent");

  mkdirSync(resources, { recursive: true });
  embedAgent({ from, to: resources });

  return resources;
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

describe("the binary embedded in the app", () => {
  it("is copied from the agent build, executable", () => {
    const resources = tempDir();

    const result = embedAgent({ from: builtAgent(), to: resources });

    for (const arch of ["amd64", "arm64"]) {
      const file = join(resources, agentFileName(arch));

      expect(existsSync(file)).toBe(true);
      expect(statSync(file).mode & 0o111).toBe(0o111);
    }
    expect(result.missing).toEqual([]);
  });

  it("writes the checksum of what it copied", () => {
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

  it("leaves no stale manifest when the agent is not built", () => {
    const resources = tempDir();
    embedAgent({ from: builtAgent(), to: resources });

    const result = embedAgent({ from: tempDir(), to: resources });

    expect(result.manifest).toBeNull();
    expect(result.missing).toEqual(["amd64", "arm64"]);
    expect(existsSync(join(resources, "manifest.json"))).toBe(false);
  });
});

describe("the binary chosen for the machine", () => {
  it("follows the architecture the probe reported", () => {
    const resources = tempDir();
    embedAgent({ from: builtAgent(), to: resources });

    const answer = agentPayload(resources, "arm64");

    expect(answer.ok && answer.result.arch).toBe("arm64");
    expect(answer.ok && answer.result.content.toString()).toBe(ARM64);
    expect(answer.ok && answer.result.sha256).toBe(digest(ARM64));
  });

  it("says plainly there is no binary, rather than failing further on", () => {
    const answer = agentPayload(tempDir(), "amd64");

    expect(answer).toMatchObject({ ok: false, error: { code: "internal" } });
    expect(answer.ok).toBe(false);
    if (!answer.ok) {
      expect(answer.error.phrase?.id).toBe("refusal.binary.arch");
      expect(answer.error.phrase?.values?.arch).toBe("amd64");
    }
  });

  it("names the architecture the app does not carry", () => {
    const resources = tempDir();
    embedAgent({ from: builtAgent(), to: resources });

    const answer = agentPayload(resources, "i686");

    expect(answer.ok).toBe(false);
    if (!answer.ok) {
      expect(answer.error.phrase?.values?.arch).toBe("i686");
    }
  });

  it("refuses a binary that no longer matches its checksum", () => {
    const resources = tempDir();
    embedAgent({ from: builtAgent(), to: resources });
    const file = join(resources, agentFileName("amd64"));
    writeFileSync(file, "un binaire remplacé après coup");
    chmodSync(file, 0o755);

    const answer = agentPayload(resources, "amd64");

    expect(answer.ok).toBe(false);
    if (!answer.ok) {
      expect(answer.error.phrase?.id).toBe("refusal.binary.checksum");
    }
  });
});

describe("sending the binary over the SSH channel", () => {
  it("pushes the bytes to standard input and verifies the received fingerprint", async () => {
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
      user: "root",
    });

    expect(answer).toMatchObject({
      ok: true,
      result: { arch: "amd64", sha256: digest(AMD64) },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].command).toBe("ssh");
    expect(calls[0].args).toEqual(
      agentSshArgs(SSH_ARGS, AGENT_INSTALL_COMMAND)
    );
    expect(calls[0].args.at(-1)).toBe(AGENT_INSTALL_COMMAND);
    expect(calls[0].stdin.toString()).toBe(AMD64);
    expect(calls[0].ended).toBe(true);
  });

  // A hardened server lets `dev` sudo `pupitred` and nothing else, so no shell ever runs as root.
  it("goes through pupitred, which verifies the signature, when the login account is not root", async () => {
    const resources = tempDir();
    embedAgent({ from: publishedAgent(), to: resources });
    const payload = agentPayload(resources, "amd64");

    if (!payload.ok) {
      throw new Error("le binaire embarqué manque");
    }

    expect(payload.result).toMatchObject({
      signature: "c2lnbmF0dXJlLWFtZDY0",
      version: "0.4.0",
    });

    const { calls, spawn } = recorder(() => ({
      out: `${digest(AMD64)}  /usr/local/bin/pupitred\n`,
    }));

    const answer = await sendAgentBinary({
      args: SSH_ARGS,
      payload: payload.result,
      spawn,
      user: "dev",
    });

    const line = calls[0]?.args.at(-1) ?? "";

    expect(answer.ok).toBe(true);
    expect(calls[0]?.stdin.toString()).toBe(
      `${JSON.stringify({ signature: "c2lnbmF0dXJlLWFtZDY0", version: "0.4.0" })}\n${AMD64}`
    );
    expect(line).toContain(
      `sudo -n ${AGENT_REMOTE_PATH} binary install < "$t"`
    );
    expect(line).not.toContain("--version");
    expect(line).not.toContain("c2lnbmF0dXJlLWFtZDY0");
    expect(installCommandAs("root", payload.result)).toBe(
      AGENT_INSTALL_COMMAND
    );
    expect(AGENT_INSTALL_COMMAND).not.toContain("'");
  });

  // An agent older than the command exits 2 with its usage; there dev still holds NOPASSWD:ALL.
  it("falls back to the previous installation only for an agent that does not know the command", () => {
    const line =
      installCommandAs("dev", {
        signature: "c2lnbmF0dXJl",
        version: "0.4.0",
      }) ?? "";

    expect(line).toContain('[ "$s" -eq 2 ] || exit "$s"');
    expect(
      line.endsWith(
        `tail -n +2 "$t" | sudo -n sh -c '${AGENT_INSTALL_COMMAND}'`
      )
    ).toBe(true);
  });

  // An unsigned dev build is only placed behind the sudo password, which rides stdin, never the command line.
  it("places a development agent on the line the password opens", async () => {
    const { calls, spawn } = recorder(() => ({
      out: `${digest("elf")}  /usr/local/bin/pupitred\n`,
    }));

    const answer = await sendAgentBinary({
      args: SSH_ARGS,
      password: "k7mp-q2xw",
      payload: {
        arch: "amd64",
        bytes: 3,
        content: Buffer.from("elf"),
        path: "pupitred",
        sha256: digest("elf"),
        signature: null,
        version: "0.0.0-unreleased",
      },
      spawn,
      user: "dev",
    });

    const line = calls[0]?.args.at(-1) ?? "";

    expect(answer.ok).toBe(true);
    expect(calls[0]?.stdin.toString()).toBe(
      `k7mp-q2xw\n${JSON.stringify({ version: "0.0.0-unreleased" })}\nelf`
    );
    expect(line).toContain("IFS= read -r p");
    expect(line).toContain("if sudo -n true 2>/dev/null");
    expect(line).toContain(
      `sudo -n ${AGENT_REMOTE_PATH} binary install --privileged < "$t"`
    );
    expect(line).toContain(
      `{ printf '%s\\n' "$p"; cat "$t"; } | sudo -S -p '' ${AGENT_REMOTE_PATH} binary install --privileged`
    );
    expect(line).not.toContain("k7mp");
  });

  it("refuses a version or signature that would escape its quotes", async () => {
    expect(
      installCommandAs("dev", {
        signature: null,
        version: "0.4.0'; rm -rf ~; '",
      })
    ).toBeNull();
    expect(
      installCommandAs("dev", { signature: "c2ln'bmF0", version: "0.4.0" })
    ).toBeNull();

    const { calls, spawn } = recorder(() => ({}));

    const answer = await sendAgentBinary({
      args: SSH_ARGS,
      payload: {
        arch: "amd64",
        bytes: 3,
        content: Buffer.from("elf"),
        path: "pupitred",
        sha256: digest("elf"),
        signature: null,
        version: "$(reboot)",
      },
      spawn,
      user: "dev",
    });

    expect(answer.ok).toBe(false);
    expect(calls.length).toBe(0);
  });

  it("refuses a server that did not receive the same bytes", async () => {
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
      user: "root",
    });

    expect(answer.ok).toBe(false);
    if (!answer.ok) {
      expect(answer.error.phrase?.id).toBe("refusal.binary.mismatch");
    }
  });

  it("surfaces what the server said when the send fails", async () => {
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
      user: "root",
    });

    expect(answer.ok).toBe(false);
    if (!answer.ok) {
      expect(String(answer.error.phrase?.values?.detail)).toContain(
        "Permission denied"
      );
    }
  });
});

describe("the app build", () => {
  it("places the binary where the main process looks for it", () => {
    const resources = join(tempDir(), "agent");
    mkdirSync(resources, { recursive: true });

    embedAgent({ from: builtAgent(), to: resources });

    expect(existsSync(join(resources, "manifest.json"))).toBe(true);
    expect(agentPayload(resources, "amd64").ok).toBe(true);
  });
});

describe("the release the app carries", () => {
  it("copies the version, notes and signature of each architecture", () => {
    const resources = embedded(publishedAgent());

    expect(carriedRelease(resources, "amd64")).toEqual({
      agent: {
        arch: "amd64",
        notes: ["Retour arrière si la nouvelle version ne répond pas."],
        signed: true,
        version: "0.4.0",
      },
      signature: "c2lnbmF0dXJlLWFtZDY0",
    });
  });

  it("carries an architecture without a signature as unsigned", () => {
    const carried = carriedRelease(embedded(publishedAgent()), "arm64");

    expect(carried).toMatchObject({
      agent: { arch: "arm64", signed: false, version: "0.4.0" },
      signature: null,
    });
  });

  it("offers nothing when the build published no version", () => {
    expect(carriedRelease(embedded(builtAgent()), "amd64")).toBeNull();
  });
});
