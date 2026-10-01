import type { Event } from "@pupitre/shared/agent-protocol/envelope";
import type {
  InstallResult,
  ProbeResult,
} from "@pupitre/shared/agent-protocol/install";
import type { AgentMigrateResult } from "@pupitre/shared/agent-protocol/migrate";
import type { License } from "@pupitre/shared/agent-protocol/session";
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

export interface MachineFacts {
  arch: string;
  version: string | null;
  license: License | null;
}

export interface AgentUpdateDeps {
  client: Pick<AgentClient, "request" | "close" | "session">;
  /** The last resort when the protocol refuses to answer a gesture: the shell probe. */
  probe: (serverId: string) => Promise<AgentResponse<ProbeResult>>;
  carried: (arch: string) => CarriedRelease | null;
  published: (arch: string) => Promise<AccountResponse<PublishedAgent>>;
  declared: (serverId: string) => Promise<AgentResponse<readonly string[]>>;
  appVersion: string;
}

/** Timer reads never fall back on the probe: against an unreachable server it would pile an ssh on every tick. */
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
        license: snapshot.result.license,
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
          license: null,
          version: probe.result.agent_version,
        },
      }
    : probe;
}

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

  const platform = platformAnswers(facts.result.license);
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

/** The beat asks every fifteen seconds: a slower server would otherwise have its reads pile up. */
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

/** `unknown_command` is an agent from before the ledger: nothing to migrate, not a failure. */
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

/** The agent fetches a published version's signature itself; only a carried version's travels with the request. */
export async function runAgentUpgrade(
  serverId: string,
  onEvent: (event: Event) => void,
  deps: AgentUpdateDeps
): Promise<AgentResponse<AgentUpgradeOutcome>> {
  const facts = await machineFacts(serverId, deps, { polled: false });

  if (!facts.ok) {
    return facts;
  }

  const platform = platformAnswers(facts.result.license);
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

/** The binary was swapped by rename: the serving process keeps the old file, only a new session reaches the new one. */
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
