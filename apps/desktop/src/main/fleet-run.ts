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

export interface FleetMergeInput {
  local: readonly Server[];
  active: string | null;
  granted: readonly FleetServer[];
  dismissed: readonly string[];
  deviceKeyPath: string;
}

export interface FleetMerge {
  config: ServersConfig;
  adopted: string[];
  /** Still listed, but no longer granted by the platform. */
  withdrawn: string[];
  /** Dropped from the list: adopted entries whose grant is gone. */
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

/** A re-enrolment mints a new id for the same machine, so a stale binding falls back to the address. */
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

/** A server typed here keeps its typed address and account; only adopted ones follow the platform. */
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

/** The app clears the entries it wrote; one typed here keeps its place, grant or no grant. */
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
