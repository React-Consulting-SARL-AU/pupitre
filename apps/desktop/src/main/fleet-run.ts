import {
  isSshFingerprint,
  isSshHost,
  isSshPort,
  isSshUser,
} from "@pupitre/shared/ssh";
import type {
  FleetServer,
  Server,
  ServerGrant,
  ServersConfig,
} from "@shared/servers";
import { grantGone, grantWithdrawn } from "@shared/servers";
import { isServerId, sshNameFree, sshSlug } from "@shared/ssh-names";

/**
 * What the platform grants, merged into the list the app keeps.
 *
 * A member who was given a server never types an address and never makes a
 * key: `GET /me/servers` carries the address, the account and the fingerprint,
 * and the key is the one this computer registered as a device — the platform
 * has already pushed its public half to the machine. This module owns no file
 * and no clock; `fleet.ts` hands it the two lists and writes what comes back.
 *
 * A server the app itself added is never overwritten by the platform's copy of
 * it: the address and the account were typed here, and stay as typed. The
 * platform learns the hardened account from the agent's heartbeat, so what it
 * hands another device is the account that actually opens the machine.
 */

export interface FleetMergeInput {
  local: readonly Server[];
  active: string | null;
  granted: readonly FleetServer[];
  /** The platform identifiers this computer was told to stop showing. */
  dismissed: readonly string[];
  /** The key this computer registered with the platform, in the app's folder. */
  deviceKeyPath: string;
}

export interface FleetMerge {
  config: ServersConfig;
  /** Local identifiers that entered the list on this pass. */
  adopted: string[];
  /** Local identifiers the platform no longer grants. */
  withdrawn: string[];
  /** Local identifiers dropped because the platform let them go. */
  released: string[];
  changed: boolean;
}

function atSameAddress(server: Server, granted: FleetServer): boolean {
  return (
    server.origin === "app" &&
    server.host === granted.host &&
    server.port === granted.port
  );
}

/**
 * The granted server a local entry is, if the platform still names one.
 *
 * An entry already bound to an identifier follows that identifier and nothing
 * else, as long as the platform still carries it. Once it is gone the binding
 * is stale rather than authoritative — a re-enrolment mints a new identifier
 * for the same machine — so the address decides again, and one entry keeps
 * standing for one machine instead of two.
 */
function matches(
  server: Server,
  granted: FleetServer,
  bound: boolean
): boolean {
  if (server.grant && bound) {
    return server.grant.id === granted.id;
  }

  return atSameAddress(server, granted);
}

function grantOf(server: Server, granted: FleetServer): ServerGrant {
  return {
    adopted: server.grant?.adopted ?? false,
    id: granted.id,
    keyReady: granted.keyReady,
    listed: true,
    opened: server.grant?.opened ?? false,
    ...(granted.organization.id ? { organization: granted.organization } : {}),
    status: granted.status,
  };
}

/** What the platform hands over is written into the SSH configuration: it has to be fit for it. */
function fitForSsh(granted: FleetServer): boolean {
  return (
    (granted.host === null || isSshHost(granted.host)) &&
    isSshUser(granted.user) &&
    isSshPort(granted.port) &&
    (granted.hostFingerprint === null ||
      isSshFingerprint(granted.hostFingerprint))
  );
}

function follow(server: Server, granted: FleetServer): Server {
  const grant = grantOf(server, granted);

  if (!fitForSsh(granted)) {
    return { ...server, grant };
  }

  const fingerprint = grant.adopted
    ? (granted.hostFingerprint ?? server.hostFingerprint)
    : (server.hostFingerprint ?? granted.hostFingerprint);

  const pinned = fingerprint ? { hostFingerprint: fingerprint } : {};

  if (!grant.adopted) {
    return { ...server, ...pinned, grant };
  }

  return {
    ...server,
    ...pinned,
    grant,
    host: granted.host ?? server.host,
    port: granted.port,
    user: granted.user,
  };
}

function unlisted(server: Server): Server {
  if (!server.grant?.listed) {
    return server;
  }

  return { ...server, grant: { ...server.grant, listed: false } };
}

/**
 * The word an adopted server answers to after `ssh`: its name, made fit for a
 * `Host` line, unless a server already here holds it. The reader can change
 * it from the servers screen, as for a server they typed.
 */
function sshNameFor(
  granted: FleetServer,
  held: readonly Server[]
): string | null {
  const slug = sshSlug(granted.name);

  return slug && sshNameFree(slug, held, []) ? slug : null;
}

function adopt(
  granted: FleetServer,
  deviceKeyPath: string,
  held: readonly Server[]
): Server | null {
  if (!(granted.host && fitForSsh(granted))) {
    return null;
  }

  const slug = sshNameFor(granted, held);

  return {
    grant: {
      adopted: true,
      id: granted.id,
      keyReady: granted.keyReady,
      listed: true,
      opened: false,
      status: granted.status,
    },
    host: granted.host,
    ...(granted.hostFingerprint
      ? { hostFingerprint: granted.hostFingerprint }
      : {}),
    id: granted.id,
    keyPath: deviceKeyPath,
    name: granted.name,
    origin: "app",
    port: granted.port,
    ...(slug ? { slug } : {}),
    user: granted.user,
  };
}

/** A separator no field can carry: a server name has spaces. */
const UNIT = "\u001f";

/** One line per server, so two passes of the merge can be told apart. */
function print(server: Server): string {
  const grant = server.grant;
  const attribution = grant
    ? [
        grant.id,
        grant.status,
        grant.keyReady,
        grant.listed,
        grant.adopted,
        grant.opened,
      ].join(",")
    : "";

  return [
    server.id,
    server.name,
    server.slug ?? "",
    server.host,
    server.port,
    server.user,
    server.origin,
    server.keyPath ?? "",
    server.hostFingerprint ?? "",
    attribution,
  ].join(UNIT);
}

/**
 * An entry the app made for a grant the platform has let go.
 *
 * The app wrote it, the app clears it: nobody typed this address, and leaving
 * it struck through in the list forever is what makes a deletion look like it
 * never happened. An entry someone added here keeps its place — that
 * configuration is theirs, grant or no grant.
 */
function released(server: Server): boolean {
  const grant = server.grant;

  return Boolean(grant?.adopted && grantGone(grant));
}

export function mergeFleet({
  local,
  active,
  granted: offered,
  dismissed,
  deviceKeyPath,
}: FleetMergeInput): FleetMerge {
  const granted = offered.filter((candidate) => isServerId(candidate.id));
  const claimed = new Set<string>();
  const carried = new Set(granted.map((candidate) => candidate.id));
  const declined = new Set(dismissed);

  const kept = local.map((server) => {
    const bound = Boolean(server.grant && carried.has(server.grant.id));
    const match = granted.find(
      (candidate) =>
        !claimed.has(candidate.id) && matches(server, candidate, bound)
    );

    if (!match) {
      return unlisted(server);
    }

    claimed.add(match.id);

    return follow(server, match);
  });

  const gone = kept.filter(released).map((server) => server.id);
  const standing = kept.filter((server) => !released(server));

  const fresh: Server[] = [];

  for (const candidate of granted) {
    if (claimed.has(candidate.id) || declined.has(candidate.id)) {
      continue;
    }

    const adopted = adopt(candidate, deviceKeyPath, [...standing, ...fresh]);

    if (adopted) {
      fresh.push(adopted);
    }
  }

  const servers = [...standing, ...fresh];
  const before = local.map(print).join("\n");
  const after = servers.map(print).join("\n");
  const held = [...declined].filter((id) => carried.has(id));
  const driven = servers.some((server) => server.id === active)
    ? active
    : (servers[0]?.id ?? null);

  return {
    adopted: fresh.map((server) => server.id),
    changed:
      before !== after || driven !== active || held.length !== dismissed.length,
    config: { active: driven, dismissed: held, servers },
    released: gone,
    withdrawn: servers
      .filter((server) => server.grant && grantWithdrawn(server.grant))
      .map((server) => server.id),
  };
}
