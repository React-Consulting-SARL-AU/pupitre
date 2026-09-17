import type { Event } from "@pupitre/shared/agent-protocol/envelope";
import type {
  InstallResult,
  ProbeResult,
} from "@pupitre/shared/agent-protocol/install";
import type { AgentMigrateResult } from "@pupitre/shared/agent-protocol/migrate";
import type { Entitlement } from "@pupitre/shared/agent-protocol/session";
import type { AgentUpgradeResult } from "@pupitre/shared/agent-protocol/system";
import type { AccountResponse } from "@shared/account";
import type { AgentResponse } from "@shared/agent";
import {
  type AgentOffer,
  type AgentUpdateState,
  type AgentUpgradeOutcome,
  floorOf,
  orderOf,
  platformAnswers,
  verdictOf,
} from "@shared/agent-update";
import type { PublishedAgent } from "./account-run";
import type { CarriedRelease } from "./agent-binary";
import type { AgentClient } from "./agent-client";
import { refusalOf, refuseWith } from "./refusal";

/**
 * Updating the agent, and the modules it installed.
 *
 * Two gestures that look alike and are not. `agent.upgrade` replaces the binary
 * that is answering us: the app names a version — the one the platform
 * publishes, or the one it carries for a server the platform no longer answers —
 * and the agent reads the fingerprint and the signature on the platform, and it
 * alone decides whether what it downloads matches. The signature the app carries
 * goes with the request only in that second case.
 * `upgrade` replays the install steps of modules already present, and only
 * names the agent's own catalogue can name.
 *
 * Between the two comes a third, which is not a gesture the reader asks for:
 * `agent.migrate`. The binary changed, the files it reads did not, and the new
 * binary carries the migrations that bring them to the shape it expects. It
 * runs them itself when it starts, so the app's call is normally a confirmation
 * — but the app is the one that knows a binary has just been replaced, so it is
 * the one that asks, and the one with somewhere to show the answer.
 *
 * Neither is done from the renderer: a signature is not something an interface
 * gets to compose.
 */

export interface MachineFacts {
  arch: string;
  version: string | null;
  entitlement: Entitlement | null;
}

export interface AgentUpdateDeps {
  client: Pick<AgentClient, "request" | "close" | "session">;
  /** The last resort when the protocol refuses to answer a gesture: the shell probe. */
  probe: (serverId: string) => Promise<AgentResponse<ProbeResult>>;
  carried: (arch: string) => CarriedRelease | null;
  /** The version the platform publishes for this architecture, when it answers. */
  published: (arch: string) => Promise<AccountResponse<PublishedAgent>>;
  declared: (serverId: string) => Promise<AgentResponse<readonly string[]>>;
  /** This app's version, the one the compatibility sheet judges. */
  appVersion: string;
}

/**
 * The architecture and the agent's version, whatever state the server is in.
 *
 * `snapshot` answers even in restricted mode, which is exactly the server that
 * needs repairing. Asked on a timer, it rides the beat channel: the platform
 * beat reads this every fifteen seconds, and a click must never wait behind
 * it. A server whose agent is too old to speak the protocol at all answers
 * nothing, and the probe — a whole `ssh` of its own — is what reads the
 * machine then, but only for a gesture: a timer that fell back on it against
 * an unreachable server would pile a probe on every tick.
 */
export async function machineFacts(
  serverId: string,
  deps: {
    client: Pick<AgentClient, "request">;
    probe?: (serverId: string) => Promise<AgentResponse<ProbeResult>>;
  },
  { polled }: { polled: boolean }
): Promise<AgentResponse<MachineFacts>> {
  const snapshot = await deps.client.request(serverId, "snapshot", undefined, {
    polled,
  });

  if (snapshot.ok) {
    return {
      ok: true,
      result: {
        arch: snapshot.result.machine.arch,
        entitlement: snapshot.result.entitlement,
        version: snapshot.result.machine.agent_version,
      },
    };
  }

  if (!deps.probe) {
    return snapshot;
  }

  const probe = await deps.probe(serverId);

  return probe.ok
    ? {
        ok: true,
        result: {
          arch: probe.result.arch,
          entitlement: null,
          version: probe.result.agent_version,
        },
      }
    : probe;
}

/**
 * What the app can offer this server.
 *
 * The platform comes first: the version it publishes is the fleet's, and the
 * agent fetches it itself. The app offers its own binary only when the platform
 * no longer answers for this server, or when the app carries a version newer
 * than the platform's — a development build ahead of what is published.
 */
export async function offerFor(
  arch: string,
  platform: boolean,
  deps: Pick<AgentUpdateDeps, "carried" | "published">
): Promise<AgentOffer | null> {
  const carried = deps.carried(arch);
  const app: AgentOffer | null = carried
    ? {
        ...carried.agent,
        signed: carried.signature !== null || platform,
        source: "app",
      }
    : null;

  if (!platform) {
    return app;
  }

  const answer = await deps.published(arch);

  if (!answer.ok) {
    return app;
  }

  const published: AgentOffer = {
    arch,
    notes: [],
    signed: true,
    source: "platform",
    version: answer.result.version,
  };

  if (!app) {
    return published;
  }

  return orderOf(app.version, published.version) === "ahead" ? app : published;
}

export async function readAgentUpdate(
  serverId: string,
  deps: AgentUpdateDeps
): Promise<AgentResponse<AgentUpdateState>> {
  const facts = await machineFacts(
    serverId,
    { client: deps.client },
    { polled: true }
  );

  if (!facts.ok) {
    return facts;
  }

  const platform = platformAnswers(facts.result.entitlement);
  const offer = await offerFor(facts.result.arch, platform, deps);

  return {
    ok: true,
    result: {
      config: deps.client.session(serverId)?.config ?? null,
      floor: floorOf(deps.appVersion),
      installed: facts.result.version,
      offer,
      order: orderOf(offer?.version ?? null, facts.result.version),
      platform,
      verdict: verdictOf(deps.appVersion, facts.result.version),
    },
  };
}

const reads = new Map<string, Promise<AgentResponse<AgentUpdateState>>>();

/**
 * One read per server at a time.
 *
 * The beat asks every fifteen seconds and a server that takes longer than that
 * to answer would have the ticks pile up behind one another: a tick that lands
 * while the previous one is still out is handed the same answer.
 */
export function readAgentUpdateShared(
  serverId: string,
  deps: AgentUpdateDeps
): Promise<AgentResponse<AgentUpdateState>> {
  const inFlight = reads.get(serverId);

  if (inFlight) {
    return inFlight;
  }

  const read = readAgentUpdate(serverId, deps).finally(() => {
    reads.delete(serverId);
  });

  reads.set(serverId, read);

  return read;
}

/**
 * The configuration brought to the shape the agent now reads.
 *
 * `unknown_command` is an agent from before the ledger: it has no migration to
 * run and no shape to carry over, so the answer is that there was nothing to
 * do, not that something went wrong.
 */
export async function runMigrate(
  serverId: string,
  deps: { client: Pick<AgentClient, "request"> }
): Promise<AgentResponse<AgentMigrateResult | null>> {
  const answer = await deps.client.request(serverId, "agent.migrate");

  if (answer.ok) {
    return answer;
  }

  return answer.error.code === "unknown_command"
    ? { ok: true, result: null }
    : answer;
}

/**
 * Two paths for the same command. Published version: the app names the number
 * and nothing else, the agent reads the digest and the signature on the
 * platform. Version carried by the app: the signature travels with the request,
 * because it is the only case where the agent cannot fetch it itself.
 */
export async function runAgentUpgrade(
  serverId: string,
  onEvent: (event: Event) => void,
  deps: AgentUpdateDeps
): Promise<AgentResponse<AgentUpgradeOutcome>> {
  const facts = await machineFacts(serverId, deps, { polled: false });

  if (!facts.ok) {
    return facts;
  }

  const platform = platformAnswers(facts.result.entitlement);
  const offer = await offerFor(facts.result.arch, platform, deps);

  if (!offer) {
    return refuseWith("internal", "refusal.agentUpdate.binary", {
      arch: facts.result.arch,
    });
  }

  const signature =
    offer.source === "platform"
      ? null
      : (deps.carried(facts.result.arch)?.signature ?? null);

  if (offer.source === "app" && !(signature || platform)) {
    return refuseWith("internal", "refusal.agentUpdate.signature", {
      arch: facts.result.arch,
      version: offer.version,
    });
  }

  const upgraded = await deps.client.request(
    serverId,
    "agent.upgrade",
    signature
      ? { signature, version: offer.version }
      : { version: offer.version },
    { onEvent }
  );

  if (!upgraded.ok) {
    return upgraded;
  }

  return await migrated(serverId, upgraded.result, deps);
}

/**
 * The session that asked for the upgrade is still on the old binary.
 *
 * The new one was put in place by a rename, so the `serve` process answering us
 * keeps the file it opened; only a new session reaches the version that was
 * just installed. Closing here is what makes the migration — and every read
 * after it — a question asked of the agent that now runs the server.
 */
async function migrated(
  serverId: string,
  upgrade: AgentUpgradeResult,
  deps: { client: Pick<AgentClient, "request" | "close"> }
): Promise<AgentResponse<AgentUpgradeOutcome>> {
  deps.client.close(serverId);

  const migration = await runMigrate(serverId, deps);

  return migration.ok
    ? { ok: true, result: { migration: migration.result, upgrade } }
    : migration;
}

export async function runModuleUpgrade(
  serverId: string,
  modules: readonly string[],
  onEvent: (event: Event) => void,
  deps: AgentUpdateDeps
): Promise<AgentResponse<InstallResult>> {
  const declared = await deps.declared(serverId);

  if (!declared.ok) {
    return declared;
  }

  const stranger = modules.find((id) => !declared.result.includes(id));

  if (stranger) {
    return {
      ok: false,
      error: {
        ...refusalOf("module_not_found", "refusal.module.undeclared", {
          module: stranger,
        }),
      },
    };
  }

  return await deps.client.request(
    serverId,
    "upgrade",
    modules.length > 0 ? { modules: [...modules] } : {},
    { onEvent }
  );
}
