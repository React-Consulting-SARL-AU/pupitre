import { execFile, spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
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

/** One key the machine presents: its fingerprint, and the line known_hosts would hold for it. */
export interface LiveKey {
  fingerprint: string;
  line: string;
}

/** What `ssh-keyscan` prints for a machine: one key per line, comments aside. */
export function keyLines(scanned: string): string[] {
  return scanned
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
}

/**
 * The keys the machine presents right now, read from its banner and nothing
 * more: no session is opened and nothing of ours is sent. `ssh-keygen` names
 * the fingerprints in the order of the lines it was given, which is what pairs
 * each with its line.
 */
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

/**
 * The pinned key, written into the app's file from the machine's own answer.
 *
 * A server granted by the organisation comes with its fingerprint and nothing
 * else: the platform pinned it, the app's known_hosts has never met the
 * machine, and `ssh`, told to be strict, would refuse a host it has no key
 * for. The pin is what the app trusts; the file only has to agree with it.
 */
export function recordHostKey(line: string, paths: SshPaths): void {
  const held = existsSync(paths.knownHostsPath)
    ? readFileSync(paths.knownHostsPath, "utf8")
    : "";
  const lead = held === "" || held.endsWith("\n") ? "" : "\n";

  writeFileSync(paths.knownHostsPath, `${held}${lead}${line}\n`, {
    mode: FILE_MODE,
  });
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
