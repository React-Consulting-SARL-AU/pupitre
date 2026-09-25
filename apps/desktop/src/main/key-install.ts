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

export const CONNECT_TIMEOUT_S = 10;
export const RUN_TIMEOUT_MS = 30_000;
const HELPER_MODE = 0o700;
const DIR_MODE = 0o700;

/** Strict on purpose: the line is quoted into a shell script, so no quote or newline may pass. */
const PUBLIC_KEY =
  /^(ssh-(ed25519|rsa|dss)|ecdsa-sha2-nistp(256|384|521)|sk-(ssh-ed25519|ecdsa-sha2-nistp256)@openssh\.com) [A-Za-z0-9+/=]{32,}( [^\r\n']*)?$/;

const METHODS = /Permission denied \(([^)]*)\)/;
const OFFERS_PASSWORD = /password|keyboard-interactive/i;
const HOST_KEY_REFUSAL =
  /Host key verification failed|REMOTE HOST IDENTIFICATION HAS CHANGED/i;
const UNREACHABLE =
  /Connection (refused|timed out|closed)|No route to host|could not resolve|Operation timed out|Network is unreachable/i;
const DENIED = /Permission denied|Authentication failed/i;

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

/** The newline guard keeps the key off the end of a last line lacking one, which would break both keys. */
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

/** A master opened by the password would let the verification pass without the key. */
export const ALONE = ["-o", "ControlPath=none", "-o", "ControlMaster=no"];

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

/** `ssh` skips the default ~/.ssh/id_* keys whenever an `IdentityFile` is set, as the app's config always does. */
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

/** With keys still offered, a refused password would read as a denied key and the screen would ask wrong. */
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

/** Holds no secret: it prints a variable of the environment of that one `ssh`. */
export function writeAskpass(dir: string): string {
  const file = join(dir, "askpass");

  mkdirSync(dir, { mode: DIR_MODE, recursive: true });
  writeFileSync(file, "#!/bin/sh\nprintf '%s\\n' \"$PUPITRE_ASKPASS\"\n", {
    mode: HELPER_MODE,
  });
  chmodSync(file, HELPER_MODE);

  return file;
}

/** Windows OpenSSH has no `SSH_ASKPASS`: it prompts on a console the app does not have. */
export function installsWithPassword(platform: Platform): boolean {
  return platform !== "win32";
}

export interface Ran {
  code: number | null;
  stderr: string;
}

/** Our own timeout is worded like the network's so `rebuffOf` reads it as unreachable. */
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
  password?: string | null;
  /** A key made a moment ago cannot open the machine yet, so the first probe is skipped. */
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
