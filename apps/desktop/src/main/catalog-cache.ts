import type { CatalogResult } from "@pupitre/shared/agent-protocol/install";
import type { Manifest } from "@pupitre/shared/catalog";
import type { AgentResponse } from "@shared/agent";
import type { AgentClient } from "./agent-client";

/**
 * The last catalogue each server declared, so that checking a field name does
 * not cost a round trip on every keystroke.
 *
 * It is the catalogue of one agent over one session: the channels closed —
 * for an upgrade, a re-push, another account — or a hello that names another
 * version mean another agent may be answering, and what it declares is asked
 * again. A module the new agent added, a field it now manages, must not be
 * refused on the word of the old one.
 */

interface Declared {
  epoch: number;
  version: string;
  catalog: CatalogResult;
}

export interface CatalogCache {
  catalogOf: (serverId: string) => Promise<AgentResponse<CatalogResult>>;
  declaredManifests: (
    serverId: string
  ) => Promise<AgentResponse<readonly Manifest[]>>;
  declaredModules: (serverId: string) => Promise<AgentResponse<string[]>>;
}

export function catalogCache(
  client: Pick<AgentClient, "request" | "session" | "epoch">
): CatalogCache {
  const declared = new Map<string, Declared>();

  function current(serverId: string): CatalogResult | null {
    const held = declared.get(serverId);
    const version = client.session(serverId)?.agent_version ?? null;

    return held &&
      held.epoch === client.epoch(serverId) &&
      held.version === version
      ? held.catalog
      : null;
  }

  async function catalogOf(
    serverId: string
  ): Promise<AgentResponse<CatalogResult>> {
    const answer = await client.request(serverId, "catalog");
    const version = client.session(serverId)?.agent_version;

    if (answer.ok && version) {
      declared.set(serverId, {
        catalog: answer.result,
        epoch: client.epoch(serverId),
        version,
      });
    }

    return answer;
  }

  async function held(serverId: string): Promise<AgentResponse<CatalogResult>> {
    const cached = current(serverId);

    if (cached) {
      return { ok: true, result: cached };
    }

    return await catalogOf(serverId);
  }

  return {
    catalogOf,

    async declaredManifests(serverId) {
      const answer = await held(serverId);

      return answer.ok ? { ok: true, result: answer.result.modules } : answer;
    },

    async declaredModules(serverId) {
      const answer = await held(serverId);

      return answer.ok
        ? { ok: true, result: answer.result.modules.map((module) => module.id) }
        : answer;
    },
  };
}
