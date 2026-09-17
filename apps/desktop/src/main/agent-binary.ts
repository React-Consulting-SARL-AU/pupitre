import { type ChildProcess, spawn as spawnChild } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentResponse } from "@shared/agent";
import type { CarriedAgent } from "@shared/agent-update";
import type { AgentDelivery } from "@shared/install";
import { AGENT_MANIFEST, type AgentManifest } from "../../scripts/embed-agent";
import { refusalOf } from "./refusal";

const SPACES = /\s+/;

const SHA256 = /^[0-9a-f]{64}$/;

/**
 * The agent, on its way to a machine that has never run it.
 *
 * A bare server cannot fetch `pupitred` on its own, and nothing on it is
 * trusted to: the app pushes the binary it carries over the channel it already
 * has, on standard input, and asks the server for the checksum of what it just
 * wrote. What the app sent and what the server holds are compared before a
 * single `install` is spoken.
 */

export type { AgentDelivery } from "@shared/install";

export const AGENT_REMOTE_PATH = "/usr/local/bin/pupitred";

const AGENT_STAGING_PATH = "/usr/local/bin/.pupitred.new";

/**
 * Written aside, then renamed over the old one: replacing a running `pupitred`
 * in place would fail with ETXTBSY on the very server that is answering us.
 *
 * The service restarts right after, because the rename does not touch it: the
 * daemon would keep running the old binary, report its old version to the
 * platform, and the app would offer forever the update it just made. A bare
 * machine has no unit yet, and its refusal concerns nobody.
 */
export const AGENT_INSTALL_COMMAND = `set -e; install -m 755 /dev/stdin ${AGENT_STAGING_PATH}; sha256sum ${AGENT_STAGING_PATH}; mv -f ${AGENT_STAGING_PATH} ${AGENT_REMOTE_PATH}; systemctl restart pupitred 2>/dev/null || true`;

/**
 * The install command for the account the push logs in as: `/usr/local/bin`
 * and the unit belong to root, and a hardened server is reached as `dev`,
 * who holds passwordless sudo for exactly this. Root needs none.
 */
export function installCommandAs(user: string): string {
  return user === "root"
    ? AGENT_INSTALL_COMMAND
    : `sudo -n sh -c '${AGENT_INSTALL_COMMAND}'`;
}

const SEND_TIMEOUT_MS = 180_000;

export interface AgentPayload {
  arch: string;
  path: string;
  sha256: string;
  bytes: number;
  content: Buffer;
}

export type ShellSpawn = (command: string, args: string[]) => ChildProcess;

export function agentSshArgs(args: string[], user: string): string[] {
  return ["-o", "BatchMode=yes", ...args, installCommandAs(user)];
}

function absent(arch: string): AgentResponse<never> {
  return {
    ok: false,
    error: {
      ...refusalOf("internal", "refusal.binary.arch", { arch }),
    },
  };
}

export function readAgentManifest(dir: string): AgentManifest | null {
  const path = join(dir, AGENT_MANIFEST);

  if (!existsSync(path)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(path, "utf8")) as AgentManifest;
  } catch {
    return null;
  }
}

/** The agent this app could offer a server of that architecture, if any. */
export interface CarriedRelease {
  agent: CarriedAgent;
  signature: string | null;
}

export function carriedRelease(
  dir: string,
  arch: string
): CarriedRelease | null {
  const manifest = readAgentManifest(dir);
  const entry = manifest?.binaries[arch];

  if (!(manifest?.version && entry)) {
    return null;
  }

  const signature = entry.signature ?? null;

  return {
    agent: {
      arch,
      notes: manifest.notes ?? [],
      signed: signature !== null,
      version: manifest.version,
    },
    signature,
  };
}

export function agentPayload(
  dir: string,
  arch: string
): AgentResponse<AgentPayload> {
  const manifest = readAgentManifest(dir);
  const entry = manifest?.binaries[arch];

  if (!entry) {
    return absent(arch);
  }

  const path = join(dir, entry.file);

  if (!existsSync(path)) {
    return absent(arch);
  }

  const content = readFileSync(path);
  const sha256 = createHash("sha256").update(content).digest("hex");

  if (sha256 !== entry.sha256) {
    return {
      ok: false,
      error: {
        ...refusalOf("internal", "refusal.binary.checksum", {
          file: entry.file,
        }),
      },
    };
  }

  return {
    ok: true,
    result: { arch, bytes: content.byteLength, content, path, sha256 },
  };
}

function defaultSpawn(command: string, args: string[]): ChildProcess {
  return spawnChild(command, args, { stdio: ["pipe", "pipe", "pipe"] });
}

/** The hash `sha256sum` prints, first field of its line. */
function receivedSum(output: string): string | null {
  for (const line of output.split("\n")) {
    const found = line.trim().split(SPACES)[0];

    if (found && SHA256.test(found)) {
      return found;
    }
  }

  return null;
}

export function sendAgentBinary({
  args,
  payload,
  user,
  spawn = defaultSpawn,
  timeoutMs = SEND_TIMEOUT_MS,
}: {
  args: string[];
  payload: AgentPayload;
  /** The account `args` log in as: what decides whether the install goes through sudo. */
  user: string;
  spawn?: ShellSpawn;
  timeoutMs?: number;
}): Promise<AgentResponse<AgentDelivery>> {
  return new Promise((resolve) => {
    const child = spawn("ssh", agentSshArgs(args, user));

    let out = "";
    let err = "";
    let settled = false;

    function settle(answer: AgentResponse<AgentDelivery>): void {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(answer);
    }

    const timer = setTimeout(() => {
      child.kill();
      settle({
        ok: false,
        error: {
          ...refusalOf("timeout", "refusal.binary.timeout", {
            seconds: Math.round(timeoutMs / 1000),
          }),
        },
      });
    }, timeoutMs);

    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      out += chunk;
    });
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      err += chunk;
    });

    child.on("error", (error: Error) =>
      settle({
        ok: false,
        error: {
          ...refusalOf("disconnected", "refusal.binary.send", {
            detail: error.message,
          }),
        },
      })
    );

    child.on("close", (code: number | null) => {
      const received = receivedSum(out);

      if (code !== 0 || !received) {
        settle({
          ok: false,
          error: {
            ...refusalOf("internal", "refusal.binary.install", {
              detail: err.trim().split("\n").at(-1) ?? String(code),
            }),
          },
        });

        return;
      }

      if (received !== payload.sha256) {
        settle({
          ok: false,
          error: {
            ...refusalOf("internal", "refusal.binary.mismatch"),
          },
        });

        return;
      }

      settle({
        ok: true,
        result: {
          arch: payload.arch,
          bytes: payload.bytes,
          path: AGENT_REMOTE_PATH,
          sha256: received,
        },
      });
    });

    child.stdin?.end(payload.content);
  });
}
