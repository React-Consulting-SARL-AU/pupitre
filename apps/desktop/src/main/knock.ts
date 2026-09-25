import { isSshHost, isSshUser } from "@pupitre/shared/ssh";
import type {
  AddressReach,
  ServerAccess,
  ServerKnock,
  ServerReach,
} from "@shared/servers";
import { designatedKeyFile } from "./key-files";
import {
  ALONE,
  askSsh,
  CONNECT_TIMEOUT_S,
  installsWithPassword,
  ownIdentities,
  RUN_TIMEOUT_MS,
  rebuffOf,
  rebuffPhrase,
} from "./key-install";
import { current, type Platform } from "./platform";
import { reachFailure, reachSsh } from "./reach";
import { argument, type SshPaths } from "./ssh-config";
import { lastLine, type ShellSpawn } from "./ssh-run";
import { trace } from "./trace";

export interface KnockOptions {
  spawn?: ShellSpawn;
  identities?: string[];
  platform?: Platform;
  timeoutMs?: number;
  reach?: (host: string, port: number) => Promise<AddressReach>;
  forgetStalePin?: () => Promise<boolean>;
  /** Only a path the file picker handed out may reach `ssh -i`. */
  designated?: (path: unknown) => boolean;
}

export function knockArgs(
  target: ServerKnock,
  paths: SshPaths,
  identities: string[]
): string[] {
  const offered = target.keyFile ? [...identities, target.keyFile] : identities;

  return [
    ...ALONE,
    "-F",
    paths.configPath,
    "-o",
    "BatchMode=yes",
    "-o",
    "IdentitiesOnly=no",
    "-o",
    `ConnectTimeout=${CONNECT_TIMEOUT_S}`,
    "-o",
    `UserKnownHostsFile=${argument(paths.knownHostsPath)}`,
    "-o",
    "StrictHostKeyChecking=accept-new",
    "-p",
    String(target.port),
    "-l",
    target.user,
    ...offered.flatMap((path) => ["-i", path]),
    target.host,
    "true",
  ];
}

/** A mismatched host key is refused, unless no listed server owns the pin: then it is a leftover, dropped once. */
export async function probeAccess(
  target: ServerKnock,
  paths: SshPaths,
  {
    spawn,
    identities = ownIdentities(),
    platform = current(),
    timeoutMs = RUN_TIMEOUT_MS,
    forgetStalePin = () => Promise.resolve(false),
    designated = designatedKeyFile,
  }: KnockOptions = {}
): Promise<ServerAccess> {
  const keyFile = designated(target.keyFile) ? target.keyFile : null;

  trace("knock", "account", {
    host: target.host,
    keyFile: keyFile !== null,
    port: target.port,
    user: target.user,
  });

  const args = knockArgs({ ...target, keyFile }, paths, identities);
  let ran = await askSsh(args, { spawn, timeoutMs });

  if (ran.code !== 0 && rebuffOf(ran.stderr) === "host-key") {
    const dropped = await forgetStalePin();

    trace("knock", "stale-pin", { dropped, host: target.host });

    if (dropped) {
      ran = await askSsh(args, { spawn, timeoutMs });
    }
  }

  if (ran.code === 0) {
    trace("knock", "opens", { host: target.host, user: target.user });

    return { access: "opens" };
  }

  const rebuff = rebuffOf(ran.stderr);

  trace("knock", "refused", { host: target.host, rebuff, user: target.user });

  if (rebuff === "password") {
    return installsWithPassword(platform)
      ? { access: "password" }
      : { access: "manual", phrase: { id: "refusal.keyInstall.windows" } };
  }

  return {
    access: "manual",
    phrase: rebuffPhrase(rebuff, lastLine(ran.stderr)),
  };
}

const MAX_PORT = 65_535;

export function isServerKnock(value: unknown): value is ServerKnock {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const target = value as Record<string, unknown>;

  return (
    typeof target.host === "string" &&
    typeof target.user === "string" &&
    Number.isInteger(target.port) &&
    (target.port as number) >= 1 &&
    (target.port as number) <= MAX_PORT &&
    (target.keyFile === null || typeof target.keyFile === "string")
  );
}

export async function knock(
  target: ServerKnock,
  paths: SshPaths,
  options: KnockOptions = {}
): Promise<ServerReach> {
  const values = { host: target.host, port: target.port, user: target.user };

  if (!isSshHost(target.host)) {
    return reachFailure("bad-host", values);
  }

  if (!isSshUser(target.user)) {
    return reachFailure("bad-user", values);
  }

  const { reach = reachSsh, ...probe } = options;
  const answered = await reach(target.host, target.port);

  if (!answered.reached) {
    return answered;
  }

  return { ...answered, access: await probeAccess(target, paths, probe) };
}
