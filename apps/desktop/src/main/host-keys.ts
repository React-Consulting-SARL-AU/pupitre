import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import type { HostKeyAction, HostKeyDecision } from "@shared/servers";
import { type Address, knownHostsKey, type SshPaths } from "./ssh-config";

/**
 * The host key, pinned on first contact.
 *
 * The first connection accepts whatever the server presents and records its
 * fingerprint. Every one after that has to present the same: a key that changed
 * means either the machine was reinstalled, or someone is answering in its
 * place, and the app cannot tell which. So it refuses, says what it expected
 * and what it got, and leaves the choice to the person who knows.
 *
 * The comparison is made against the machine as it answers today, not only
 * against the app's own file: a server rebuilt at the same address leaves the
 * file and the pin agreeing with each other and both wrong, and `ssh` alone
 * would refuse without offering the way out.
 */

const run = promisify(execFile);

export const REINSTALLED_ACTION: HostKeyAction = "reinstalled";

const CHANGED_MARKS = [
  "REMOTE HOST IDENTIFICATION HAS CHANGED",
  "HOST KEY HAS CHANGED",
  "Host key verification failed",
];

const FINGERPRINT = /SHA256:[A-Za-z0-9+/=]+/;
const FINGERPRINTS = /SHA256:[A-Za-z0-9+/=]+/g;
const SCAN_TIMEOUT_S = 3;

function changed(pinned: string, observed: string | null): HostKeyDecision {
  return {
    actions: [REINSTALLED_ACTION, "cancel"],
    expected: pinned,
    phrase: { id: "refusal.hostKey.changed" },
    observed,
    status: "changed",
  };
}

/**
 * `observed` is what the app's file holds, `live` what the machine presents
 * now — every key type it offers, or nothing when it could not be asked.
 */
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

/**
 * The fingerprints the machine presents right now, read from its banner and
 * nothing more: no session is opened and nothing of ours is sent.
 */
export async function liveFingerprints(
  server: Address,
  scan: Scan = keyscan
): Promise<string[]> {
  try {
    const keys = await scan(server.host, server.port);

    return keys.trim() === "" ? [] : await fingerprintsOf(keys);
  } catch {
    return [];
  }
}

/** What ssh says when it refuses for that reason, and not for another. */
export function looksLikeHostKeyChange(output: string): boolean {
  return CHANGED_MARKS.some((mark) => output.includes(mark));
}

/**
 * The fingerprint the app's own known_hosts currently holds for that server.
 *
 * The system file is never consulted: what the app trusts is what the app
 * recorded, and nothing a tool elsewhere added.
 */
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

/** Forgets the recorded key, so the next contact pins whatever answers. */
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
    // Nothing recorded for that host: there is nothing to forget.
  }
}
