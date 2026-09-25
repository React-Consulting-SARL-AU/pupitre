import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AgentResponse, ErrorPhrase } from "@shared/agent";
import type { KeyInstall, KeyInstallPhase, Server } from "@shared/servers";
import { current, type Platform } from "./platform";
import { refusalOf } from "./refusal";
import { type SshPaths, sshArgs } from "./ssh-config";
import {
  lastLine,
  runSsh,
  type ShellSpawn,
  type SshRunOptions,
} from "./ssh-run";
import { trace } from "./trace";

/**
 * The app putting its own key on the server, rather than dictating a command.
 *
 * Three attempts, in the order of what costs the reader least. The machine may
 * already open — a key the provider seeded, an imported key that was always
 * there — and then nothing is written at all. Failing that, whatever this
 * computer already holds is offered: an agent, the identities of ~/.ssh. Only
 * when neither opens the door is the account's password asked for, and it is
 * asked once, used once, and never written anywhere.
 *
 * The password never reaches a command line, a file or a log: `ssh` reads it
 * from the helper `SSH_ASKPASS` names, which prints one environment variable
 * and nothing else. What lands on the machine is the public half, appended to
 * `authorized_keys` if it is not already a line of it.
 */

export const CONNECT_TIMEOUT_S = 10;
export const RUN_TIMEOUT_MS = 30_000;
const HELPER_MODE = 0o700;
const DIR_MODE = 0o700;

/**
 * A public key line, as `ssh-keygen` writes it: a type, a body, a comment.
 *
 * Named types rather than "a word": the line is quoted into a shell script, and
 * what this refuses is anything that is not a key — a quote, a newline, a
 * sentence someone typed by hand.
 */
const PUBLIC_KEY =
  /^(ssh-(ed25519|rsa|dss)|ecdsa-sha2-nistp(256|384|521)|sk-(ssh-ed25519|ecdsa-sha2-nistp256)@openssh\.com) [A-Za-z0-9+/=]{32,}( [^\r\n']*)?$/;

const METHODS = /Permission denied \(([^)]*)\)/;
const OFFERS_PASSWORD = /password|keyboard-interactive/i;
const HOST_KEY_REFUSAL =
  /Host key verification failed|REMOTE HOST IDENTIFICATION HAS CHANGED/i;
const UNREACHABLE =
  /Connection (refused|timed out|closed)|No route to host|could not resolve|Operation timed out|Network is unreachable/i;
const DENIED = /Permission denied|Authentication failed/i;

/**
 * What the machine answered when the app knocked, and only that.
 *
 * `Rebuff` is the reading of a refusal, not its wording: the screen gets a
 * dictionary entry, and the reason it names comes from what `ssh` said on its
 * error stream.
 */
export type Rebuff =
  | "password"
  | "no-password"
  | "host-key"
  | "unreachable"
  | "other";

export function rebuffOf(stderr: string): Rebuff {
  if (HOST_KEY_REFUSAL.test(stderr)) {
    return "host-key";
  }

  if (UNREACHABLE.test(stderr)) {
    return "unreachable";
  }

  const methods = METHODS.exec(stderr);

  if (methods) {
    return OFFERS_PASSWORD.test(methods[1]) ? "password" : "no-password";
  }

  return DENIED.test(stderr) ? "password" : "other";
}

/**
 * The line added to the account's `authorized_keys`, and nothing else touched.
 *
 * Idempotent on purpose: a second attempt after a refused verification must not
 * leave the key twice in the file. The newline guard is not decoration — a file
 * whose last line has no newline would otherwise take our key onto the end of
 * somebody else's, and neither of the two would open the machine afterwards.
 */
export function authorizeScript(publicKey: string): string {
  const line = publicKey.trim();

  if (!PUBLIC_KEY.test(line)) {
    throw new Error("refusal.key.unreadable");
  }

  return `set -e
umask 077
mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"
touch "$HOME/.ssh/authorized_keys"
chmod 600 "$HOME/.ssh/authorized_keys"
if ! grep -qxF '${line}' "$HOME/.ssh/authorized_keys"; then
  if [ -s "$HOME/.ssh/authorized_keys" ] && [ -n "$(tail -c 1 "$HOME/.ssh/authorized_keys")" ]; then
    printf '\\n' >> "$HOME/.ssh/authorized_keys"
  fi
  printf '%s\\n' '${line}' >> "$HOME/.ssh/authorized_keys"
fi
`;
}

/**
 * The one thing none of the three attempts shares: a session already open.
 *
 * The app's configuration multiplexes, and a master opened with a password
 * would serve the verification that follows: the key would pass for installed
 * when it was the password that opened the door. So each attempt connects for
 * itself alone, and leaves no master behind it.
 */
export const ALONE = ["-o", "ControlPath=none", "-o", "ControlMaster=no"];

/** Signing in with the app's key alone, which is the whole question here. */
export function opensArgs(server: Server, paths: SshPaths): string[] {
  return [
    ...ALONE,
    "-o",
    "BatchMode=yes",
    "-o",
    `ConnectTimeout=${CONNECT_TIMEOUT_S}`,
    ...sshArgs(server, paths),
    "true",
  ];
}

/**
 * The identities `ssh` would have found on its own, named out loud.
 *
 * The default ~/.ssh/id_* list is added only when no `IdentityFile` was given,
 * and the app's configuration always gives one — the key of that server. So
 * without naming them, "everything this computer already holds" is the agent
 * and nothing more, and a machine that opens with a key sitting unloaded in
 * ~/.ssh comes back asking for a password the account may not even have.
 */
const DEFAULT_IDENTITIES = [
  "id_ed25519",
  "id_ecdsa",
  "id_ecdsa_sk",
  "id_ed25519_sk",
  "id_rsa",
];

export function ownIdentities(home: string = homedir()): string[] {
  return DEFAULT_IDENTITIES.map((name) => join(home, ".ssh", name)).filter(
    (path) => existsSync(path)
  );
}

/** Everything this computer already holds: the agent, and ~/.ssh. */
export function offeredArgs(
  server: Server,
  paths: SshPaths,
  identities: string[] = ownIdentities()
): string[] {
  return [
    ...ALONE,
    "-o",
    "BatchMode=yes",
    "-o",
    "IdentitiesOnly=no",
    "-o",
    `ConnectTimeout=${CONNECT_TIMEOUT_S}`,
    ...identities.flatMap((path) => ["-i", path]),
    ...sshArgs(server, paths),
    "sh -s",
  ];
}

/**
 * The account's password, and no key at all.
 *
 * `PubkeyAuthentication=no` is what makes the answer readable: with keys still
 * offered, a machine that refuses the password would come back saying the key
 * was denied, and the screen would ask for the wrong thing.
 */
export function passwordArgs(server: Server, paths: SshPaths): string[] {
  return [
    ...ALONE,
    "-o",
    "BatchMode=no",
    "-o",
    "PubkeyAuthentication=no",
    "-o",
    "PreferredAuthentications=password,keyboard-interactive",
    "-o",
    "NumberOfPasswordPrompts=1",
    "-o",
    `ConnectTimeout=${CONNECT_TIMEOUT_S}`,
    ...sshArgs(server, paths),
    "sh -s",
  ];
}

/**
 * The helper `ssh` calls instead of prompting a terminal it does not have.
 *
 * It holds no secret: it prints one variable of the environment it is given,
 * which is the environment of that one `ssh` and of nothing else.
 */
export function writeAskpass(dir: string): string {
  const file = join(dir, "askpass");

  mkdirSync(dir, { mode: DIR_MODE, recursive: true });
  writeFileSync(file, "#!/bin/sh\nprintf '%s\\n' \"$PUPITRE_ASKPASS\"\n", {
    mode: HELPER_MODE,
  });
  chmodSync(file, HELPER_MODE);

  return file;
}

/**
 * Windows has no `SSH_ASKPASS`: its OpenSSH prompts on the console or nowhere,
 * and there is no console here. The two other systems have had it since 8.4.
 */
export function installsWithPassword(platform: Platform): boolean {
  return platform !== "win32";
}

export interface Ran {
  code: number | null;
  stderr: string;
}

/**
 * How an account answered, in the words `rebuffOf` reads: a clock that ran
 * out reads as the network's own timeout, an `ssh` that never started as its
 * error.
 */
export async function askSsh(
  args: string[],
  options: Omit<SshRunOptions, "scope">
): Promise<Ran> {
  const run = await runSsh(args, { ...options, scope: "key" });

  switch (run.status) {
    case "exited":
      return { code: run.code, stderr: run.stderr };
    case "timeout":
      return { code: null, stderr: "Operation timed out" };
    default:
      return { code: null, stderr: run.message };
  }
}

const PHRASES: Record<Rebuff, string> = {
  password: "refusal.keyInstall.denied",
  "no-password": "refusal.keyInstall.keysOnly",
  "host-key": "refusal.keyInstall.hostKey",
  unreachable: "refusal.keyInstall.unreachable",
  other: "refusal.keyInstall.failed",
};

/** The dictionary entry a refusal reads as, with what `ssh` said when it says something. */
export function rebuffPhrase(rebuff: Rebuff, detail: string): ErrorPhrase {
  const id = PHRASES[rebuff];

  return detail ? { id: `${id}.detail`, values: { detail } } : { id };
}

function manual(rebuff: Rebuff, detail: string): AgentResponse<KeyInstall> {
  return {
    ok: true,
    result: { status: "manual", phrase: rebuffPhrase(rebuff, detail) },
  };
}

export interface KeyInstallOptions {
  server: Server;
  paths: SshPaths;
  publicKey: string;
  /** Typed once by the reader, held nowhere, gone when this call returns. */
  password?: string | null;
  /**
   * The key was made a moment ago and the form already knocked with everything
   * else: nothing opens the machine yet, and asking it again would only cost
   * the reader a connection.
   */
  freshKey?: boolean;
  onPhase?: (phase: KeyInstallPhase) => void;
  spawn?: ShellSpawn;
  platform?: Platform;
  timeoutMs?: number;
}

export async function installKey({
  server,
  paths,
  publicKey,
  password = null,
  freshKey = false,
  onPhase = () => undefined,
  spawn,
  platform = current(),
  timeoutMs = RUN_TIMEOUT_MS,
}: KeyInstallOptions): Promise<AgentResponse<KeyInstall>> {
  if (server.origin !== "app") {
    return { ok: false, error: refusalOf("bad_request", "refusal.key.system") };
  }

  let script: string;
  try {
    script = authorizeScript(publicKey);
  } catch {
    return {
      ok: false,
      error: refusalOf("internal", "refusal.key.unreadable"),
    };
  }

  if (password && !installsWithPassword(platform)) {
    return {
      ok: true,
      result: {
        status: "manual",
        phrase: { id: "refusal.keyInstall.windows" },
      },
    };
  }

  trace("key", "install", {
    host: server.host,
    port: server.port,
    server: server.id,
    user: server.user,
    with: password ? "password" : "keys",
  });

  if (!freshKey) {
    onPhase("reaching");

    const already = await askSsh(opensArgs(server, paths), {
      spawn,
      timeoutMs,
    });

    if (already.code === 0) {
      trace("key", "install.opened", { already: true, server: server.id });

      return { ok: true, result: { installed: false, status: "opened" } };
    }
  }

  onPhase("authorizing");

  const pushed = password
    ? await askSsh(passwordArgs(server, paths), {
        env: askpassEnv(paths, password),
        spawn,
        stdin: script,
        timeoutMs,
      })
    : await askSsh(offeredArgs(server, paths), {
        spawn,
        stdin: script,
        timeoutMs,
      });

  if (pushed.code !== 0) {
    const rebuff = rebuffOf(pushed.stderr);

    trace("key", "install.refused", { rebuff, server: server.id });

    if (rebuff === "password" && installsWithPassword(platform)) {
      return {
        ok: true,
        result: { retry: password !== null, status: "password" },
      };
    }

    return manual(rebuff, lastLine(pushed.stderr));
  }

  onPhase("verifying");

  const opened = await askSsh(opensArgs(server, paths), { spawn, timeoutMs });

  trace("key", "install.verified", {
    opened: opened.code === 0,
    server: server.id,
  });

  return opened.code === 0
    ? { ok: true, result: { installed: true, status: "opened" } }
    : manual("other", lastLine(opened.stderr));
}

function askpassEnv(paths: SshPaths, password: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    DISPLAY: process.env.DISPLAY ?? ":0",
    PUPITRE_ASKPASS: password,
    SSH_ASKPASS: writeAskpass(paths.dir),
    SSH_ASKPASS_REQUIRE: "force",
  };
}
