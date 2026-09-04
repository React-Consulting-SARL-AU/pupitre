import { join } from "node:path";
import type {
  InstallReport,
  InstallResult,
  ModuleConfig,
} from "@pupitre/shared/agent-protocol/install";
import type { AgentResponse } from "@shared/agent";
import { app, ipcMain } from "electron";
import { agentClient } from "./agent";
import {
  type AgentDelivery,
  agentPayload,
  sendAgentBinary,
} from "./agent-binary";
import { declaredModules } from "./catalog";
import { inspect } from "./inspection";
import { type InstallUpdate, runInstall } from "./install-run";
import { takeSecrets } from "./install-secrets";
import { byId, paths } from "./servers";
import { sshArgs } from "./ssh-config";

/**
 * The installation screen, seen from the main process.
 *
 * The renderer names a server and modules; nothing else of what it says is
 * trusted. The module names are checked against the catalogue this server's own
 * agent declared, and the secrets never make the trip: they are taken from the
 * vault here, on the way out.
 */

const AGENT_DIR = "agent";

function agentResourcesDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, AGENT_DIR)
    : join(app.getAppPath(), "resources", AGENT_DIR);
}

function refuse(message: string, fix: string): AgentResponse<never> {
  return { ok: false, error: { code: "bad_request", fix, message } };
}

async function deliver(
  serverId: string,
  arch: string
): Promise<
  AgentResponse<{ arch: string; bytes: number; path: string; sha256: string }>
> {
  const server = byId(serverId);

  if (!server) {
    return refuse(
      "Ce serveur n'est plus dans la liste.",
      "Choisis un serveur dans les réglages."
    );
  }

  const payload = agentPayload(agentResourcesDir(), arch);

  if (!payload.ok) {
    return payload;
  }

  return await sendAgentBinary({
    args: sshArgs(server, paths()),
    payload: payload.result,
  });
}

/**
 * The shape of what the renderer said, before anything is done with it. What
 * the names mean is checked further on, against the agent's own catalogue.
 */
function checked(
  serverId: unknown,
  modules: unknown
): { serverId: string; modules: string[] } | AgentResponse<never> {
  if (typeof serverId !== "string" || !byId(serverId)) {
    return refuse(
      "Ce serveur n'est plus dans la liste.",
      "Choisis un serveur dans les réglages."
    );
  }

  if (!Array.isArray(modules) || modules.some((id) => typeof id !== "string")) {
    return refuse(
      "La liste des modules est illisible.",
      "Reviens au catalogue et refais ta sélection."
    );
  }

  return { modules: modules as string[], serverId };
}

function configOf(value: unknown): ModuleConfig {
  return value && typeof value === "object" ? (value as ModuleConfig) : {};
}

/**
 * The binary, put on the machine before anything is asked of it.
 *
 * A bare server has no catalogue to answer with, so the send comes first and
 * the architecture is read from the probe here rather than taken from the
 * interface: the renderer names a server, and nothing else about the machine.
 */
async function sendAgent(
  serverId: unknown
): Promise<AgentResponse<AgentDelivery>> {
  if (typeof serverId !== "string" || !byId(serverId)) {
    return refuse(
      "Ce serveur n'est plus dans la liste.",
      "Choisis un serveur dans les réglages."
    );
  }

  const probe = await inspect(serverId);

  if (!probe.ok) {
    return probe;
  }

  return await deliver(serverId, probe.result.arch);
}

export function registerInstall(): void {
  ipcMain.handle(
    "install:start",
    async (
      event,
      token: unknown,
      serverId: unknown,
      modules: unknown,
      config: unknown
    ): Promise<AgentResponse<InstallResult>> => {
      const call = checked(serverId, modules);

      if ("ok" in call) {
        return call;
      }

      const update = (change: InstallUpdate) => {
        if (typeof token === "string" && !event.sender.isDestroyed()) {
          event.sender.send("install:update", { token, update: change });
        }
      };

      return await runInstall(
        call.serverId,
        call.modules,
        configOf(config),
        update,
        {
          client: agentClient,
          declared: declaredModules,
          deliver,
          probe: inspect,
          secrets: takeSecrets,
        }
      );
    }
  );

  ipcMain.handle("install:agent-send", (_event, serverId: unknown) =>
    sendAgent(serverId)
  );

  ipcMain.handle(
    "install:report",
    async (
      _event,
      serverId: unknown
    ): Promise<AgentResponse<InstallReport>> => {
      if (typeof serverId !== "string" || !byId(serverId)) {
        return refuse(
          "Ce serveur n'est plus dans la liste.",
          "Choisis un serveur dans les réglages."
        );
      }

      return await agentClient.request(serverId, "report");
    }
  );
}
