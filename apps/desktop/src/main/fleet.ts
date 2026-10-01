import type { AgentErrorCode, AgentResponse } from "@shared/agent";
import type { FleetView, ServersConfig } from "@shared/servers";
import { grantPending, grantWithdrawn } from "@shared/servers";
import { account, deviceKey, deviceKeyPath } from "./account";
import { asAgentError } from "./enrollment-run";
import { mergeFleet } from "./fleet-run";
import { handle } from "./ipc";
import { anything, shape } from "./ipc-guard";
import { refuseWith } from "./refusal";
import { byId, noteOpened, read, restore, write } from "./servers";

function refuse(
  code: AgentErrorCode,
  id: string,
  values?: Record<string, string | number>
): AgentResponse<never> {
  return refuseWith(code, id, values);
}

export function registerFleet(settle: (serverId: string) => void): void {
  handle("fleet:list", shape(), async (): Promise<AgentResponse<FleetView>> => {
    const granted = await account.fleet();

    if (!granted.ok) {
      return { ok: false, error: asAgentError(granted.error) };
    }

    // The key must exist before an SSH config block names it: granted servers open with it alone.
    await deviceKey();

    const config = read();
    const merged = mergeFleet({
      active: config.active,
      deviceKeyPath: deviceKeyPath(),
      dismissed: config.dismissed,
      granted: granted.result,
      local: config.servers,
    });

    for (const serverId of merged.released) {
      settle(serverId);
    }

    return {
      ok: true,
      result: {
        adopted: merged.adopted,
        changed: merged.changed,
        config: merged.changed ? write(() => merged.config) : config,
        granted: granted.result,
        withdrawn: merged.withdrawn,
      },
    };
  });

  handle(
    "fleet:open",
    shape(anything),
    (_event, id): AgentResponse<ServersConfig> => {
      const server = typeof id === "string" ? byId(id) : null;

      if (!server?.grant) {
        return refuse("bad_request", "refusal.fleet.unknown");
      }

      if (grantWithdrawn(server.grant)) {
        return refuse("license_required", "refusal.fleet.withdrawn");
      }

      if (grantPending(server.grant)) {
        return refuse("bad_request", "refusal.fleet.pending");
      }

      return { ok: true, result: noteOpened(server.id) };
    }
  );

  // A local removal leaves the platform's grant standing: without this, an accidental removal would be final.
  handle(
    "fleet:restore",
    shape(),
    (): AgentResponse<ServersConfig> => ({ ok: true, result: restore() })
  );
}
