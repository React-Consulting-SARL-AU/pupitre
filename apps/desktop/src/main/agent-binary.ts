import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentResponse } from "@shared/agent";
import type { CarriedAgent } from "@shared/agent-update";
import type { AgentDelivery } from "@shared/install";
import { AGENT_MANIFEST, type AgentManifest } from "../../scripts/embed-agent";
import { refusalOf, refuseWith } from "./refusal";
import { lastLine, runSsh, type ShellSpawn } from "./ssh-run";

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

/** A build of the repository publishes no version: its agent carries no release key, and places it unchecked. */
const UNRELEASED = "0.0.0-unreleased";

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

/** What the signature covers, and what the agent is asked to check it against. */
export interface PushedRelease {
  version: string;
  signature: string | null;
}

const SHELL_VERSION = /^[0-9A-Za-z.+-]+$/;

const SHELL_SIGNATURE = /^[A-Za-z0-9+/=]+$/;

/**
 * The install command for the account the push logs in as.
 *
 * A bare server is reached as root, and has no `pupitred` yet to check
 * anything: the binary the app verified is written as it is. A hardened one is
 * reached as `dev`, whom sudo lets run exactly `pupitred binary install`
 * without a password (decision 0015): the bytes land in a file of dev's,
 * behind a first line saying what the signature covers, and pupitred checks
 * the signature with the key it carries before it replaces itself. A build of
 * the repository has no signature to check, so it goes by `--privileged`,
 * which sudo runs on the password alone (`pushedInput` puts it first). An
 * agent older than the command answers with its usage, exit 2 — on such a
 * server dev still holds NOPASSWD:ALL, and the shell install is the one left.
 *
 * A version or a signature that would not read as one is no command at all.
 */
export function installCommandAs(
  user: string,
  release: PushedRelease
): string | null {
  if (user === "root") {
    return AGENT_INSTALL_COMMAND;
  }

  if (
    !SHELL_VERSION.test(release.version) ||
    (release.signature !== null && !SHELL_SIGNATURE.test(release.signature))
  ) {
    return null;
  }

  const install = `${AGENT_REMOTE_PATH} binary install`;
  const placed =
    release.signature === null
      ? [
          `IFS= read -r p; cat > "$t"; s=0`,
          `if sudo -n true 2>/dev/null; then sudo -n ${install} --privileged < "$t" || s=$?; else { printf '%s\\n' "$p"; cat "$t"; } | sudo -S -p '' ${install} --privileged || s=$?; fi`,
        ]
      : [`cat > "$t"; s=0`, `sudo -n ${install} < "$t" || s=$?`];

  return [
    `set -e; t=$(mktemp); trap 'rm -f "$t"' EXIT`,
    ...placed,
    `[ "$s" -eq 2 ] || exit "$s"`,
    `tail -n +2 "$t" | sudo -n sh -c '${AGENT_INSTALL_COMMAND}'`,
  ].join("; ");
}

/**
 * What the push writes on standard input: the binary alone for root; for dev,
 * the line the signature covers first, and before it the sudo password when
 * the binary goes by the line only the password opens.
 */
export function pushedInput(
  user: string,
  payload: AgentPayload,
  password: string | null
): Buffer {
  if (user === "root") {
    return payload.content;
  }

  const header = `${JSON.stringify(
    payload.signature === null
      ? { version: payload.version }
      : { signature: payload.signature, version: payload.version }
  )}\n`;
  const unlock = payload.signature === null ? `${password ?? ""}\n` : "";

  return Buffer.concat([Buffer.from(unlock + header), payload.content]);
}

const SEND_TIMEOUT_MS = 180_000;

export interface AgentPayload extends PushedRelease {
  arch: string;
  path: string;
  sha256: string;
  bytes: number;
  content: Buffer;
}

export function agentSshArgs(args: string[], command: string): string[] {
  return ["-o", "BatchMode=yes", ...args, command];
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
    result: {
      arch,
      bytes: content.byteLength,
      content,
      path,
      sha256,
      signature: entry.signature ?? null,
      version: manifest?.version ?? UNRELEASED,
    },
  };
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

export async function sendAgentBinary({
  args,
  payload,
  user,
  password = null,
  spawn,
  timeoutMs = SEND_TIMEOUT_MS,
}: {
  args: string[];
  payload: AgentPayload;
  /** The account `args` log in as: what decides whether the install goes through sudo. */
  user: string;
  /** The sudo password of `dev`, for a binary without a signature: it rides the first line, never the command. */
  password?: string | null;
  spawn?: ShellSpawn;
  timeoutMs?: number;
}): Promise<AgentResponse<AgentDelivery>> {
  const command = installCommandAs(user, payload);

  if (command === null) {
    return refuseWith("internal", "refusal.binary.install", {
      detail: payload.version,
    });
  }

  const run = await runSsh(agentSshArgs(args, command), {
    scope: "binary",
    spawn,
    stdin: pushedInput(user, payload, password),
    timeoutMs,
  });

  if (run.status === "failed") {
    return refuseWith("disconnected", "refusal.binary.send", {
      detail: run.message,
    });
  }

  if (run.status === "timeout") {
    return refuseWith("timeout", "refusal.binary.timeout", {
      seconds: Math.round(timeoutMs / 1000),
    });
  }

  const received = receivedSum(run.stdout);

  if (run.code !== 0 || !received) {
    return refuseWith("internal", "refusal.binary.install", {
      detail: lastLine(run.stderr) || String(run.code),
    });
  }

  if (received !== payload.sha256) {
    return refuseWith("internal", "refusal.binary.mismatch");
  }

  return {
    ok: true,
    result: {
      arch: payload.arch,
      bytes: payload.bytes,
      path: AGENT_REMOTE_PATH,
      sha256: received,
    },
  };
}
