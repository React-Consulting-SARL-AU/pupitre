import { type ChildProcess, spawn as spawnChild } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentResponse } from "@shared/agent";
import type { CarriedAgent } from "@shared/agent-update";
import type { AgentDelivery } from "@shared/install";
import { AGENT_MANIFEST, type AgentManifest } from "../../scripts/embed-agent";

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
 */
export const AGENT_INSTALL_COMMAND = `set -e; install -m 755 /dev/stdin ${AGENT_STAGING_PATH}; sha256sum ${AGENT_STAGING_PATH}; mv -f ${AGENT_STAGING_PATH} ${AGENT_REMOTE_PATH}`;

const SEND_TIMEOUT_MS = 180_000;

export interface AgentPayload {
  arch: string;
  path: string;
  sha256: string;
  bytes: number;
  content: Buffer;
}

export type ShellSpawn = (command: string, args: string[]) => ChildProcess;

export function agentSshArgs(args: string[]): string[] {
  return ["-o", "BatchMode=yes", ...args, AGENT_INSTALL_COMMAND];
}

function absent(arch: string): AgentResponse<never> {
  return {
    ok: false,
    error: {
      code: "internal",
      message: `Cette app ne porte pas d'agent pour l'architecture ${arch}.`,
      fix: "Construis l'agent avec bun --cwd=apps/agent run build, puis reconstruis l'app.",
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
        code: "internal",
        message: `Le binaire ${entry.file} embarqué ne correspond pas à sa somme de contrôle.`,
        fix: "Reconstruis l'app : bun --cwd=apps/desktop run build.",
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
  spawn = defaultSpawn,
  timeoutMs = SEND_TIMEOUT_MS,
}: {
  args: string[];
  payload: AgentPayload;
  spawn?: ShellSpawn;
  timeoutMs?: number;
}): Promise<AgentResponse<AgentDelivery>> {
  return new Promise((resolve) => {
    const child = spawn("ssh", agentSshArgs(args));

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
          code: "timeout",
          message: `L'envoi de l'agent n'a pas abouti en ${Math.round(timeoutMs / 1000)} s.`,
          fix: "Vérifie le débit de la connexion au serveur, puis relance l'installation.",
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
          code: "disconnected",
          message: `L'agent n'a pas pu être envoyé sur le serveur : ${error.message}`,
          fix: "Vérifie que le serveur répond en SSH, puis relance l'installation.",
        },
      })
    );

    child.on("close", (code: number | null) => {
      const received = receivedSum(out);

      if (code !== 0 || !received) {
        settle({
          ok: false,
          error: {
            code: "disconnected",
            message: `L'agent n'a pas pu être installé sur le serveur : ${err.trim().split("\n").at(-1) ?? `ssh a rendu le code ${String(code)}`}`,
            fix: `Vérifie que le compte utilisé peut écrire dans ${AGENT_REMOTE_PATH}, puis relance l'installation.`,
          },
        });

        return;
      }

      if (received !== payload.sha256) {
        settle({
          ok: false,
          error: {
            code: "internal",
            message:
              "Le serveur n'a pas la même somme de contrôle que le binaire envoyé.",
            fix: "Relance l'installation ; si l'écart persiste, vérifie l'espace disque du serveur.",
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
