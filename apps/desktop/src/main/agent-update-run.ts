import type { Event } from "@pupitre/shared/agent-protocol/envelope";
import type {
  InstallResult,
  ProbeResult,
} from "@pupitre/shared/agent-protocol/install";
import type { Entitlement } from "@pupitre/shared/agent-protocol/session";
import type { AgentUpgradeResult } from "@pupitre/shared/agent-protocol/system";
import type { AccountResponse } from "@shared/account";
import type { AgentResponse } from "@shared/agent";
import {
  type AgentOffer,
  type AgentUpdateState,
  floorOf,
  orderOf,
  platformAnswers,
  verdictOf,
} from "@shared/agent-update";
import type { PublishedAgent } from "./account-run";
import type { CarriedRelease } from "./agent-binary";
import type { AgentClient } from "./agent-client";
import { refusalOf } from "./refusal";

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
 * Neither is done from the renderer: a signature is not something an interface
 * gets to compose.
 */

export interface MachineFacts {
  arch: string;
  version: string | null;
  entitlement: Entitlement | null;
}

export interface AgentUpdateDeps {
  client: Pick<AgentClient, "request">;
  /** The last resort when the protocol refuses to answer: the shell probe. */
  probe: (serverId: string) => Promise<AgentResponse<ProbeResult>>;
  carried: (arch: string) => CarriedRelease | null;
  /** The version the platform publishes for this architecture, when it answers. */
  published: (arch: string) => Promise<AccountResponse<PublishedAgent>>;
  declared: (serverId: string) => Promise<AgentResponse<readonly string[]>>;
  /** This app's version, the one the compatibility sheet judges. */
  appVersion: string;
}

function refuse(message: string, fix: string): AgentResponse<never> {
  return { ok: false, error: { code: "internal", fix, message } };
}

/**
 * The architecture and the agent's version, whatever state the server is in.
 *
 * `snapshot` answers even in restricted mode, which is exactly the server that
 * needs repairing; a server whose agent is too old to speak the protocol at all
 * answers nothing, and the probe is what reads the machine then.
 */
export async function machineFacts(
  serverId: string,
  deps: Pick<AgentUpdateDeps, "client" | "probe">
): Promise<AgentResponse<MachineFacts>> {
  const snapshot = await deps.client.request(serverId, "snapshot");

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
  const facts = await machineFacts(serverId, deps);

  if (!facts.ok) {
    return facts;
  }

  const platform = platformAnswers(facts.result.entitlement);
  const offer = await offerFor(facts.result.arch, platform, deps);

  return {
    ok: true,
    result: {
      floor: floorOf(deps.appVersion),
      installed: facts.result.version,
      offer,
      order: orderOf(offer?.version ?? null, facts.result.version),
      platform,
      verdict: verdictOf(deps.appVersion, facts.result.version),
    },
  };
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
): Promise<AgentResponse<AgentUpgradeResult>> {
  const facts = await machineFacts(serverId, deps);

  if (!facts.ok) {
    return facts;
  }

  const platform = platformAnswers(facts.result.entitlement);
  const offer = await offerFor(facts.result.arch, platform, deps);

  if (!offer) {
    return refuse(
      `Cette app ne porte pas d'agent pour l'architecture ${facts.result.arch}, et la console n'en publie pas pour ce serveur.`,
      "Construis l'agent avec bun --cwd=apps/agent run build, puis reconstruis l'app."
    );
  }

  if (offer.source === "platform") {
    return await deps.client.request(
      serverId,
      "agent.upgrade",
      { version: offer.version },
      { onEvent }
    );
  }

  const signature = deps.carried(facts.result.arch)?.signature ?? null;

  if (!(signature || platform)) {
    return refuse(
      `Cette app ne porte pas la signature de l'agent ${offer.version} pour ${facts.result.arch}, et ce serveur n'atteint plus la console qui la sert.`,
      "Publie cette version avec bun --cwd=apps/agent run release, puis reconstruis l'app."
    );
  }

  return await deps.client.request(
    serverId,
    "agent.upgrade",
    signature
      ? { signature, version: offer.version }
      : { version: offer.version },
    { onEvent }
  );
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
