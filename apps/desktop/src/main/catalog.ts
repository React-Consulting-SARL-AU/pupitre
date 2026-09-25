import type { CatalogResult } from "@pupitre/shared/agent-protocol/install";
import type { AgentResponse } from "@shared/agent";
import type { SecretMarks } from "@shared/secrets";
import { account } from "./account";
import { agentClient } from "./agent";
import { catalogCache } from "./catalog-cache";
import {
  forgetSecrets,
  generateSecret,
  marks,
  revealSecret,
  setSecret,
} from "./install-secrets";
import { handle } from "./ipc";
import { anything, isString, shape } from "./ipc-guard";
import { refusalOf } from "./refusal";
import { byId } from "./servers";
import { usageRefusal } from "./usage-guard";

function unknownServer(): AgentResponse<never> {
  return {
    ok: false,
    error: {
      ...refusalOf("bad_request", "refusal.server.unknown"),
    },
  };
}

function known(serverId: unknown): string | null {
  return typeof serverId === "string" && byId(serverId) ? serverId : null;
}

const declared = catalogCache(agentClient);

export function catalogOf(
  serverId: unknown
): Promise<AgentResponse<CatalogResult>> {
  const server = known(serverId);

  return server ? declared.catalogOf(server) : Promise.resolve(unknownServer());
}

// Read from the agent rather than a list of the app's own, which would refuse what a newer agent accepts.
export const declaredManifests = declared.declaredManifests;

export const declaredModules = declared.declaredModules;

// Checked against the agent's catalogue so that a name invented in the interface never becomes a vault slot.
async function secretField(
  serverId: string,
  moduleId: string,
  key: string
): Promise<{ moduleId: string; key: string } | null> {
  const manifests = await declared.declaredManifests(serverId);

  if (!manifests.ok) {
    return null;
  }

  const manifest = manifests.result.find((m) => m.id === moduleId);
  const root = key.split(".")[0] ?? key;
  const field = manifest?.fields.find((f) => f.key === root);

  if (!field) {
    return null;
  }

  const carries =
    field.kind === "secret" ||
    (field.kind === "list" && field.items === "secret");

  return carries ? { moduleId, key } : null;
}

export function registerCatalog(): void {
  handle("catalog:list", shape(anything), (_event, serverId) =>
    catalogOf(serverId)
  );

  handle(
    "catalog:secret-set",
    shape(anything, isString, isString, isString),
    async (
      _event,
      serverId,
      moduleId,
      key,
      value
    ): Promise<AgentResponse<SecretMarks>> => {
      const server = known(serverId);

      if (!server) {
        return unknownServer();
      }

      const refused = usageRefusal(() => account.guard());

      if (refused) {
        return refused;
      }

      const field = await secretField(server, moduleId, key);

      return {
        ok: true,
        result: field
          ? setSecret(server, field.moduleId, field.key, value)
          : marks(server),
      };
    }
  );

  handle(
    "catalog:secret-generate",
    shape(anything, isString, isString),
    async (
      _event,
      serverId,
      moduleId,
      key
    ): Promise<AgentResponse<SecretMarks>> => {
      const server = known(serverId);

      if (!server) {
        return unknownServer();
      }

      const refused = usageRefusal(() => account.guard());

      if (refused) {
        return refused;
      }

      const field = await secretField(server, moduleId, key);

      return {
        ok: true,
        result: field
          ? generateSecret(server, field.moduleId, field.key)
          : marks(server),
      };
    }
  );

  // Revealing and forgetting only touch this process's memory: no usage guard, forgetting must always work.
  handle(
    "catalog:secret-reveal",
    shape(isString, isString, isString),
    (
      _event,
      serverId,
      moduleId,
      key
    ): { value: string | null; marks: SecretMarks } => {
      const server = known(serverId);

      if (!server) {
        return { value: null, marks: {} };
      }

      return {
        value: revealSecret(server, moduleId, key),
        marks: marks(server),
      };
    }
  );

  handle("catalog:secret-forget", shape(isString), (_event, serverId) => {
    const server = known(serverId);

    if (server) {
      forgetSecrets(server);
    }
  });
}
