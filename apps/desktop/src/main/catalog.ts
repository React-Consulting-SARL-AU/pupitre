import type { CatalogResult } from "@pupitre/shared/agent-protocol/install";
import type { Manifest } from "@pupitre/shared/catalog";
import type { AgentResponse } from "@shared/agent";
import type { SecretMarks } from "@shared/secrets";
import { ipcMain } from "electron";
import { account } from "./account";
import { agentClient } from "./agent";
import {
  forgetSecrets,
  generateSecret,
  marks,
  revealSecret,
  setSecret,
} from "./install-secrets";
import { refusalOf } from "./refusal";
import { byId } from "./servers";
import { usageRefusal } from "./usage-guard";

/**
 * The catalogue screens, seen from the main process.
 *
 * Two things cross: the catalogue the agent declares, untouched, and the marks
 * of the secrets it will need. A secret value only ever travels one way — in —
 * except for the single reveal the screen is allowed to ask for.
 *
 * Filing a secret prepares an installation, so it goes through the usage
 * guard. Revealing one and forgetting them do not: they read and clear this
 * process's own memory, and forgetting has to work whatever the account says.
 */

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

/**
 * The last catalogue each server declared, so that checking a field name does
 * not cost a round trip on every keystroke.
 */
const declared = new Map<string, CatalogResult>();

export async function catalogOf(
  serverId: unknown
): Promise<AgentResponse<CatalogResult>> {
  const server = known(serverId);

  if (!server) {
    return unknownServer();
  }

  const answer = await agentClient.request(server, "catalog");

  if (answer.ok) {
    declared.set(server, answer.result);
  }

  return answer;
}

/**
 * The manifests this server's agent stands behind, as it last declared them.
 *
 * Whoever needs to know what a module asks for reads it here rather than
 * holding a list of its own: the catalogue belongs to the agent, and an app
 * that kept a second copy would refuse what a newer agent accepts.
 */
export async function declaredManifests(
  serverId: string
): Promise<AgentResponse<readonly Manifest[]>> {
  const cached = declared.get(serverId);

  if (cached) {
    return { ok: true, result: cached.modules };
  }

  const answer = await catalogOf(serverId);

  return answer.ok ? { ok: true, result: answer.result.modules } : answer;
}

/**
 * The module names this server's agent stands behind, for whoever has to check
 * that what the interface asked for exists.
 */
export async function declaredModules(
  serverId: string
): Promise<AgentResponse<string[]>> {
  const cached = declared.get(serverId);

  if (cached) {
    return { ok: true, result: cached.modules.map((module) => module.id) };
  }

  const answer = await catalogOf(serverId);

  return answer.ok
    ? { ok: true, result: answer.result.modules.map((module) => module.id) }
    : answer;
}

/**
 * A field the manifest declared as a secret, and nothing else.
 *
 * The renderer names a module and a key; both are checked against the catalogue
 * the agent has just given, so a name invented in the interface never becomes a
 * slot in the vault.
 */
async function secretField(
  serverId: string,
  moduleId: unknown,
  key: unknown
): Promise<{ moduleId: string; key: string } | null> {
  if (typeof moduleId !== "string" || typeof key !== "string") {
    return null;
  }

  let catalog = declared.get(serverId);

  if (!catalog) {
    const answer = await catalogOf(serverId);

    if (!answer.ok) {
      return null;
    }

    catalog = answer.result;
  }

  const manifest = catalog.modules.find((m) => m.id === moduleId);
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
  ipcMain.handle("catalog:list", (_event, serverId: unknown) =>
    catalogOf(serverId)
  );

  ipcMain.handle(
    "catalog:secret-set",
    async (
      _event,
      serverId: unknown,
      moduleId: unknown,
      key: unknown,
      value: unknown
    ): Promise<AgentResponse<SecretMarks>> => {
      const server = known(serverId);

      if (!server) {
        return unknownServer();
      }

      const refused = usageRefusal(() => account.guard());

      if (refused) {
        return refused;
      }

      if (typeof value !== "string") {
        return { ok: true, result: marks(server) };
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

  ipcMain.handle(
    "catalog:secret-generate",
    async (
      _event,
      serverId: unknown,
      moduleId: unknown,
      key: unknown
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

  ipcMain.handle(
    "catalog:secret-reveal",
    (
      _event,
      serverId: unknown,
      moduleId: unknown,
      key: unknown
    ): { value: string | null; marks: SecretMarks } => {
      const server = known(serverId);

      if (
        !(server && typeof moduleId === "string" && typeof key === "string")
      ) {
        return { value: null, marks: {} };
      }

      return {
        value: revealSecret(server, moduleId, key),
        marks: marks(server),
      };
    }
  );

  ipcMain.handle("catalog:secret-forget", (_event, serverId: unknown) => {
    const server = known(serverId);

    if (server) {
      forgetSecrets(server);
    }
  });
}
