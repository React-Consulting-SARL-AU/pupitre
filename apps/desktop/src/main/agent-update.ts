import type { Event } from "@pupitre/shared/agent-protocol/envelope";
import type { InstallResult } from "@pupitre/shared/agent-protocol/install";
import type { AgentMigrateResult } from "@pupitre/shared/agent-protocol/migrate";
import type { AgentResponse } from "@shared/agent";
import type {
  AgentUpdateState,
  AgentUpgradeOutcome,
} from "@shared/agent-update";
import type { WebContents } from "electron";
import { account } from "./account";
import { agentClient } from "./agent";
import { carriedRelease } from "./agent-binary";
import {
  type AgentUpdateDeps,
  readAgentUpdateShared,
  runAgentUpgrade,
  runMigrate,
  runModuleUpgrade,
} from "./agent-update-run";
import { appVersion } from "./app-version";
import { declaredModules } from "./catalog";
import { inspect } from "./inspection";
import { agentResourcesDir } from "./install";
import { handle } from "./ipc";
import { anything, isString, shape } from "./ipc-guard";
import { refusalOf } from "./refusal";
import { relayTo } from "./relay";
import { byId } from "./servers";

// The agent's version and signature come from the release embedded at build time and never cross the bridge.

function deps(): AgentUpdateDeps {
  return {
    appVersion: appVersion(),
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

function known(serverId: string): string | null {
  return byId(serverId) ? serverId : null;
}

function relay(sender: WebContents, token: string): (event: Event) => void {
  return relayTo<Event>(sender, token, "agent-update:event", "event");
}

function names(modules: unknown): string[] | null {
  if (!Array.isArray(modules) || modules.some((id) => typeof id !== "string")) {
    return null;
  }

  return modules as string[];
}

export function registerAgentUpdate(): void {
  handle(
    "agent-update:state",
    shape(isString),
    async (_event, serverId): Promise<AgentResponse<AgentUpdateState>> => {
      const server = known(serverId);

      return server
        ? await readAgentUpdateShared(server, deps())
        : unknownServer();
    }
  );

  handle(
    "agent-update:agent",
    shape(isString, isString),
    async (
      event,
      token,
      serverId
    ): Promise<AgentResponse<AgentUpgradeOutcome>> => {
      const server = known(serverId);

      return server
        ? await runAgentUpgrade(server, relay(event.sender, token), deps())
        : unknownServer();
    }
  );

  handle(
    "agent-update:migrate",
    shape(isString),
    async (
      _event,
      serverId
    ): Promise<AgentResponse<AgentMigrateResult | null>> => {
      const server = known(serverId);

      return server ? await runMigrate(server, deps()) : unknownServer();
    }
  );

  handle(
    "agent-update:modules",
    shape(isString, isString, anything),
    async (
      event,
      token,
      serverId,
      modules
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
