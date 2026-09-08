import type { Event } from "@pupitre/shared/agent-protocol/envelope";
import type { InstallResult } from "@pupitre/shared/agent-protocol/install";
import type { AgentUpgradeResult } from "@pupitre/shared/agent-protocol/system";
import type { AgentResponse } from "@shared/agent";
import type { AgentUpdateState } from "@shared/agent-update";
import { app, ipcMain, type WebContents } from "electron";
import { account } from "./account";
import { agentClient } from "./agent";
import { carriedRelease } from "./agent-binary";
import {
  type AgentUpdateDeps,
  readAgentUpdate,
  runAgentUpgrade,
  runModuleUpgrade,
} from "./agent-update-run";
import { declaredModules } from "./catalog";
import { inspect } from "./inspection";
import { agentResourcesDir } from "./install";
import { refusalOf } from "./refusal";
import { relayTo } from "./relay";
import { byId } from "./servers";

/**
 * The update screens, seen from the main process.
 *
 * The renderer names a server and, for the modules, names from the catalogue
 * the agent itself declared. The version and the signature of the agent come
 * from the release embedded at build time and never cross the bridge in either
 * direction: what goes back is the envelope, refusal included, as it arrived.
 */

function deps(): AgentUpdateDeps {
  return {
    appVersion: app.getVersion(),
    carried: (arch) => carriedRelease(agentResourcesDir(), arch),
    client: agentClient,
    declared: declaredModules,
    probe: inspect,
    published: (arch) => account.latestAgentRelease(arch),
  };
}

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

function relay(sender: WebContents, token: unknown): (event: Event) => void {
  return relayTo<Event>(sender, token, "agent-update:event", "event");
}

function names(modules: unknown): string[] | null {
  if (!Array.isArray(modules) || modules.some((id) => typeof id !== "string")) {
    return null;
  }

  return modules as string[];
}

export function registerAgentUpdate(): void {
  ipcMain.handle(
    "agent-update:state",
    async (
      _event,
      serverId: unknown
    ): Promise<AgentResponse<AgentUpdateState>> => {
      const server = known(serverId);

      return server ? await readAgentUpdate(server, deps()) : unknownServer();
    }
  );

  ipcMain.handle(
    "agent-update:agent",
    async (
      event,
      token: unknown,
      serverId: unknown
    ): Promise<AgentResponse<AgentUpgradeResult>> => {
      const server = known(serverId);

      return server
        ? await runAgentUpgrade(server, relay(event.sender, token), deps())
        : unknownServer();
    }
  );

  ipcMain.handle(
    "agent-update:modules",
    async (
      event,
      token: unknown,
      serverId: unknown,
      modules: unknown
    ): Promise<AgentResponse<InstallResult>> => {
      const server = known(serverId);
      const wanted = names(modules);

      if (!server) {
        return unknownServer();
      }

      if (!wanted) {
        return {
          ok: false,
          error: {
            ...refusalOf("bad_request", "refusal.modules.unreadable"),
            fix: undefined,
          },
        };
      }

      return await runModuleUpgrade(
        server,
        wanted,
        relay(event.sender, token),
        deps()
      );
    }
  );
}
