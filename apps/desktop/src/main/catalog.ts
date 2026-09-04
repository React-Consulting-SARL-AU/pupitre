import type { CatalogResult } from "@pupitre/shared/agent-protocol/install";
import type { AgentResponse } from "@shared/agent";
import type { SecretMarks } from "@shared/secrets";
import { ipcMain } from "electron";
import { agentClient } from "./agent";
import {
  forgetSecrets,
  generateSecret,
  marks,
  revealSecret,
  setSecret,
} from "./install-secrets";
import { byId } from "./servers";

/**
 * The catalogue screens, seen from the main process.
 *
 * Two things cross: the catalogue the agent declares, untouched, and the marks
 * of the secrets it will need. A secret value only ever travels one way — in —
 * except for the single reveal the screen is allowed to ask for.
 */

function unknownServer(): AgentResponse<never> {
  return {
    ok: false,
    error: {
      code: "bad_request",
      message: "Ce serveur n'est plus dans la liste.",
      fix: "Choisis un serveur dans les réglages.",
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
    ): Promise<SecretMarks> => {
      const server = known(serverId);

      if (!server || typeof value !== "string") {
        return {};
      }

      const field = await secretField(server, moduleId, key);

      return field
        ? setSecret(server, field.moduleId, field.key, value)
        : marks(server);
    }
  );

  ipcMain.handle(
    "catalog:secret-generate",
    async (
      _event,
      serverId: unknown,
      moduleId: unknown,
      key: unknown
    ): Promise<SecretMarks> => {
      const server = known(serverId);

      if (!server) {
        return {};
      }

      const field = await secretField(server, moduleId, key);

      return field
        ? generateSecret(server, field.moduleId, field.key)
        : marks(server);
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
