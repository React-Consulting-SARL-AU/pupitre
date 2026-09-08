import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import type { HostKeyAction, HostKeyDecision, Server } from "@shared/servers";
import { knownHostsKey, type SshPaths } from "./ssh-config";

/**
 * The host key, pinned on first contact.
 *
 * The first connection accepts whatever the server presents and records its
 * fingerprint. Every one after that has to present the same: a key that changed
 * means either the machine was reinstalled, or someone is answering in its
 * place, and the app cannot tell which. So it refuses, says what it expected
 * and what it got, and leaves the choice to the person who knows.
 */

const run = promisify(execFile);

export const REINSTALLED_ACTION: HostKeyAction = "reinstalled";

const CHANGED_MARKS = [
  "REMOTE HOST IDENTIFICATION HAS CHANGED",
  "HOST KEY HAS CHANGED",
  "Host key verification failed",
];

const FINGERPRINT = /SHA256:[A-Za-z0-9+/=]+/;

export function hostKeyDecision(
  pinned: string | undefined,
  observed: string | null
): HostKeyDecision {
  if (!pinned) {
    return { status: "first_contact" };
  }

  if (pinned === observed) {
    return { fingerprint: pinned, status: "trusted" };
  }

  return {
    actions: [REINSTALLED_ACTION, "cancel"],
    expected: pinned,
    phrase: { id: "refusal.hostKey.changed" },
    observed,
    status: "changed",
  };
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
  server: Server,
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
  server: Server,
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
