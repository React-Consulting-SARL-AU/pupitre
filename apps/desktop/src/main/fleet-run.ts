import type {
  FleetServer,
  Server,
  ServerGrant,
  ServersConfig,
} from "@shared/servers";
import { grantGone, grantWithdrawn } from "@shared/servers";

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

function follow(server: Server, granted: FleetServer): Server {
  const grant = grantOf(server, granted);
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

function adopt(granted: FleetServer, deviceKeyPath: string): Server | null {
  if (!granted.host) {
    return null;
  }

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
  granted,
  dismissed,
  deviceKeyPath,
}: FleetMergeInput): FleetMerge {
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

  const fresh = granted
    .filter(
      (candidate) => !(claimed.has(candidate.id) || declined.has(candidate.id))
    )
    .map((candidate) => adopt(candidate, deviceKeyPath))
    .filter((server): server is Server => server !== null);

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
