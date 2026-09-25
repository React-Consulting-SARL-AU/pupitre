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

export type { AgentDelivery } from "@shared/install";

export const AGENT_REMOTE_PATH = "/usr/local/bin/pupitred";

const AGENT_STAGING_PATH = "/usr/local/bin/.pupitred.new";

/** A repository build carries no release key, so its agent is placed unchecked. */
const UNRELEASED = "0.0.0-unreleased";

/** Renamed over the running binary to dodge ETXTBSY; restarted so the daemon stops reporting the old version. */
export const AGENT_INSTALL_COMMAND = `set -e; install -m 755 /dev/stdin ${AGENT_STAGING_PATH}; sha256sum ${AGENT_STAGING_PATH}; mv -f ${AGENT_STAGING_PATH} ${AGENT_REMOTE_PATH}; systemctl restart pupitred 2>/dev/null || true`;

export interface PushedRelease {
  version: string;
  signature: string | null;
}

const SHELL_VERSION = /^[0-9A-Za-z.+-]+$/;

const SHELL_SIGNATURE = /^[A-Za-z0-9+/=]+$/;

/** Exit 2 is an agent older than `binary install`: dev still holds NOPASSWD:ALL there, so the shell install runs. */
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

/** An unsigned binary goes by `--privileged`, which only the sudo password on the first line opens. */
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
  user: string;
  /** Rides the first line of stdin, never the command line. */
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
