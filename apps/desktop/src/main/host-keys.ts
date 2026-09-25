import { execFile, spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { promisify } from "node:util";
import type { HostKeyAction, HostKeyDecision } from "@shared/servers";
import { type Address, knownHostsKey, type SshPaths } from "./ssh-config";

const run = promisify(execFile);

export const REINSTALLED_ACTION: HostKeyAction = "reinstalled";

const FINGERPRINT = /SHA256:[A-Za-z0-9+/=]+/;
const FINGERPRINTS = /SHA256:[A-Za-z0-9+/=]+/g;
const ED25519_LISTED = /\sED25519\s+SHA256:/;
const SCAN_TIMEOUT_S = 3;
const FILE_MODE = 0o600;

function changed(pinned: string, observed: string | null): HostKeyDecision {
  return {
    actions: [REINSTALLED_ACTION, "cancel"],
    expected: pinned,
    phrase: { id: "refusal.hostKey.changed" },
    observed,
    status: "changed",
  };
}

/** `live` wins over the file: a server rebuilt at the same address leaves file and pin agreeing and both wrong. */
export function hostKeyDecision(
  pinned: string | undefined,
  observed: string | null,
  live: readonly string[] = []
): HostKeyDecision {
  if (!pinned) {
    return { status: "first_contact" };
  }

  if (live.length > 0 && !live.includes(pinned)) {
    return changed(pinned, live[0]);
  }

  if (pinned === observed) {
    return { fingerprint: pinned, status: "trusted" };
  }

  return changed(pinned, observed);
}

export type Scan = (host: string, port: number) => Promise<string>;

async function keyscan(host: string, port: number): Promise<string> {
  const { stdout } = await run("ssh-keyscan", [
    "-p",
    String(port),
    "-T",
    String(SCAN_TIMEOUT_S),
    host,
  ]);

  return stdout;
}

function fingerprintsOf(keys: string): Promise<string[]> {
  return new Promise((resolve) => {
    const child = spawn("ssh-keygen", ["-lf", "-"], {
      stdio: ["pipe", "pipe", "ignore"],
    });

    let out = "";

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      out += chunk;
    });
    child.on("error", () => resolve([]));
    child.on("close", () => resolve(out.match(FINGERPRINTS) ?? []));
    child.stdin.end(keys);
  });
}

export interface LiveKey {
  fingerprint: string;
  line: string;
}

export function keyLines(scanned: string): string[] {
  return scanned
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
}

/** `ssh-keygen` prints fingerprints in the order of the lines it was given, which pairs each with its line. */
export async function liveKeys(
  server: Address,
  scan: Scan = keyscan
): Promise<LiveKey[]> {
  try {
    const lines = keyLines(await scan(server.host, server.port));

    if (lines.length === 0) {
      return [];
    }

    const fingerprints = await fingerprintsOf(lines.join("\n"));

    return fingerprints.length === lines.length
      ? lines.map((line, index) => ({
          fingerprint: fingerprints[index] as string,
          line,
        }))
      : [];
  } catch {
    return [];
  }
}

/** A granted server comes with only a fingerprint; strict `ssh` would refuse a host its known_hosts never met. */
export function recordHostKey(line: string, paths: SshPaths): void {
  const held = existsSync(paths.knownHostsPath)
    ? readFileSync(paths.knownHostsPath, "utf8")
    : "";
  const lead = held === "" || held.endsWith("\n") ? "" : "\n";

  writeFileSync(paths.knownHostsPath, `${held}${lead}${line}\n`, {
    mode: FILE_MODE,
  });
}

/** The system known_hosts is never consulted: the app trusts only what it recorded itself. */
export async function observedFingerprint(
  server: Address,
  paths: SshPaths
): Promise<string | null> {
  if (!existsSync(paths.knownHostsPath)) {
    return null;
  }

  try {
    const { stdout } = await run("ssh-keygen", [
      "-l",
      "-F",
      knownHostsKey(server),
      "-f",
      paths.knownHostsPath,
    ]);

    return FINGERPRINT.exec(stdout)?.[0] ?? null;
  } catch {
    return null;
  }
}

/** Ed25519 is the one key the agent declares when it trades its token; other types are left to the platform. */
export async function ed25519Fingerprint(
  server: Address,
  paths: SshPaths
): Promise<string | null> {
  if (!existsSync(paths.knownHostsPath)) {
    return null;
  }

  try {
    const { stdout } = await run("ssh-keygen", [
      "-l",
      "-F",
      knownHostsKey(server),
      "-f",
      paths.knownHostsPath,
    ]);

    return ed25519Of(stdout);
  } catch {
    return null;
  }
}

export function ed25519Of(listing: string): string | null {
  for (const line of listing.split("\n")) {
    if (line.startsWith("#") || !ED25519_LISTED.test(line)) {
      continue;
    }

    return FINGERPRINT.exec(line)?.[0] ?? null;
  }

  return null;
}

export async function forgetHostKey(
  server: Address,
  paths: SshPaths
): Promise<void> {
  if (!existsSync(paths.knownHostsPath)) {
    return;
  }

  try {
    await run("ssh-keygen", [
      "-R",
      knownHostsKey(server),
      "-f",
      paths.knownHostsPath,
    ]);
  } catch {
    // Nothing recorded for that host.
  }
}
