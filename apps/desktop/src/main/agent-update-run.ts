import type { Event } from "@pupitre/shared/agent-protocol/envelope";
import type {
  InstallResult,
  ProbeResult,
} from "@pupitre/shared/agent-protocol/install";
import type { AgentUpgradeResult } from "@pupitre/shared/agent-protocol/system";
import type { AgentResponse } from "@shared/agent";
import { type AgentUpdateState, orderOf } from "@shared/agent-update";
import type { CarriedRelease } from "./agent-binary";
import type { AgentClient } from "./agent-client";

/**
 * Updating the agent, and the modules it installed.
 *
 * Two gestures that look alike and are not. `agent.upgrade` replaces the binary
 * that is answering us: the app hands it the version it carries and the
 * signature published with it, and the agent alone decides whether what it
 * downloads matches. `upgrade` replays the install steps of modules already
 * present, and only names the agent's own catalogue can name.
 *
 * Neither is done from the renderer: a signature is not something an interface
 * gets to compose.
 */

export interface MachineFacts {
  arch: string;
  version: string | null;
}

export interface AgentUpdateDeps {
  client: Pick<AgentClient, "request">;
  /** The last resort when the protocol refuses to answer: the shell probe. */
  probe: (serverId: string) => Promise<AgentResponse<ProbeResult>>;
  carried: (arch: string) => CarriedRelease | null;
  declared: (serverId: string) => Promise<AgentResponse<readonly string[]>>;
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
  deps: AgentUpdateDeps
): Promise<AgentResponse<MachineFacts>> {
  const snapshot = await deps.client.request(serverId, "snapshot");

  if (snapshot.ok) {
    return {
      ok: true,
      result: {
        arch: snapshot.result.machine.arch,
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
          version: probe.result.agent_version,
        },
      }
    : probe;
}

export async function readAgentUpdate(
  serverId: string,
  deps: AgentUpdateDeps
): Promise<AgentResponse<AgentUpdateState>> {
  const facts = await machineFacts(serverId, deps);

  if (!facts.ok) {
    return facts;
  }

  const carried = deps.carried(facts.result.arch)?.agent ?? null;

  return {
    ok: true,
    result: {
      carried,
      installed: facts.result.version,
      order: orderOf(carried?.version ?? null, facts.result.version),
    },
  };
}

export async function runAgentUpgrade(
  serverId: string,
  onEvent: (event: Event) => void,
  deps: AgentUpdateDeps
): Promise<AgentResponse<AgentUpgradeResult>> {
  const facts = await machineFacts(serverId, deps);

  if (!facts.ok) {
    return facts;
  }

  const release = deps.carried(facts.result.arch);

  if (!release) {
    return refuse(
      `Cette app ne porte pas d'agent pour l'architecture ${facts.result.arch}.`,
      "Construis l'agent avec bun --cwd=apps/agent run build, puis reconstruis l'app."
    );
  }

  if (!release.signature) {
    return refuse(
      `Cette app ne porte pas la signature de l'agent ${release.agent.version} pour ${facts.result.arch}.`,
      "Publie cette version avec bun --cwd=apps/agent run release, puis reconstruis l'app."
    );
  }

  return await deps.client.request(
    serverId,
    "agent.upgrade",
    { signature: release.signature, version: release.agent.version },
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
        code: "module_not_found",
        message: `Le catalogue de ce serveur ne déclare pas ${stranger}.`,
        fix: "Recharge la liste des services, puis relance la mise à jour.",
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
