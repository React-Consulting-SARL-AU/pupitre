import { spawn as spawnChild } from "node:child_process";
import type {
  AddressReach,
  ServerAccess,
  ServerKnock,
  ServerReach,
} from "@shared/servers";
import {
  ALONE,
  CONNECT_TIMEOUT_S,
  installsWithPassword,
  lastLine,
  ownIdentities,
  RUN_TIMEOUT_MS,
  rebuffOf,
  rebuffPhrase,
  runSsh,
  type ShellSpawn,
} from "./key-install";
import { current, type Platform } from "./platform";
import { reachFailure, reachSsh } from "./reach";
import { isHost, isUser } from "./server-setup";
import { argument, type SshPaths } from "./ssh-config";
import { trace } from "./trace";

/**
 * Knocking on an account before a key exists for it.
 *
 * The address is asked first whether it speaks SSH at all, then the account is
 * asked what would open it: everything this computer already holds is offered
 * — an agent, the identities of ~/.ssh, the file a reader chose to import —
 * and the refusal, if any, says whether a password would do. That is what the
 * form needs to know before making a key: a machine that opens is not asked a
 * password, a machine that takes one is asked it there and then, and a machine
 * that takes neither is announced before it enters the list, along with the
 * reason the app will hand the line over.
 *
 * The host key is pinned here the way the first connection would pin it: in
 * the app's own known_hosts, on first sight. A key that already sits there and
 * does not match is a refusal, not a warning, exactly as it is later on — unless
 * no server of the list reaches that address any more, in which case the pin
 * is a leftover of a machine that was removed, and is dropped for one more
 * knock.
 */

export interface KnockOptions {
  spawn?: ShellSpawn;
  identities?: string[];
  platform?: Platform;
  timeoutMs?: number;
  reach?: (host: string, port: number) => Promise<AddressReach>;
  /** Drops a pin no listed server owns; answers whether there was one to drop. */
  forgetStalePin?: () => Promise<boolean>;
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

export async function probeAccess(
  target: ServerKnock,
  paths: SshPaths,
  {
    spawn = spawnChild as ShellSpawn,
    identities = ownIdentities(),
    platform = current(),
    timeoutMs = RUN_TIMEOUT_MS,
    forgetStalePin = () => Promise.resolve(false),
  }: KnockOptions = {}
): Promise<ServerAccess> {
  trace("knock", "account", {
    host: target.host,
    port: target.port,
    user: target.user,
  });

  let ran = await runSsh(knockArgs(target, paths, identities), {
    spawn,
    timeoutMs,
  });

  if (ran.code !== 0 && rebuffOf(ran.stderr) === "host-key") {
    const dropped = await forgetStalePin();

    trace("knock", "stale-pin", { dropped, host: target.host });

    if (dropped) {
      ran = await runSsh(knockArgs(target, paths, identities), {
        spawn,
        timeoutMs,
      });
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

/** The address, then the account: the second question is only worth asking once the first answers. */
export async function knock(
  target: ServerKnock,
  paths: SshPaths,
  options: KnockOptions = {}
): Promise<ServerReach> {
  const values = { host: target.host, port: target.port, user: target.user };

  if (!isHost(target.host)) {
    return reachFailure("bad-host", values);
  }

  if (!isUser(target.user)) {
    return reachFailure("bad-user", values);
  }

  const { reach = reachSsh, ...probe } = options;
  const answered = await reach(target.host, target.port);

  if (!answered.reached) {
    return answered;
  }

  return { ...answered, access: await probeAccess(target, paths, probe) };
}
