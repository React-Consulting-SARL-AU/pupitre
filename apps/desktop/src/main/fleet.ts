import type { AgentErrorCode, AgentResponse } from "@shared/agent";
import type { FleetView, ServersConfig } from "@shared/servers";
import { grantPending, grantWithdrawn } from "@shared/servers";
import { ipcMain } from "electron";
import { account, deviceKey, deviceKeyPath } from "./account";
import { asAgentError } from "./enrollment-run";
import { mergeFleet } from "./fleet-run";
import { refuseWith } from "./refusal";
import { byId, noteOpened, read, restore, write } from "./servers";

/**
 * The servers the platform grants this account, in the app's own list.
 *
 * The renderer names a server of that list and nothing else: the address, the
 * account and the key come from `GET /me/servers` and from the key this
 * computer registered as a device. Nothing is typed, and nothing is written on
 * disk while the platform has not answered — an unanswered call leaves the
 * list exactly as the last one left it.
 */

function refuse(
  code: AgentErrorCode,
  id: string,
  values?: Record<string, string | number>
): AgentResponse<never> {
  return refuseWith(code, id, values);
}

export function registerFleet(settle: (serverId: string) => void): void {
  ipcMain.handle("fleet:list", async (): Promise<AgentResponse<FleetView>> => {
    const granted = await account.fleet();

    if (!granted.ok) {
      return { ok: false, error: asAgentError(granted.error) };
    }

    // The key has to exist before a block of the SSH configuration names it:
    // a granted server is opened with it and with nothing else.
    await deviceKey();

    const config = read();
    const merged = mergeFleet({
      active: config.active,
      deviceKeyPath: deviceKeyPath(),
      dismissed: config.dismissed,
      granted: granted.result,
      local: config.servers,
    });

    // A server the platform no longer grants leaves the list here, and what
    // was open on it goes with it; the others are not touched by the merge.
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

  ipcMain.handle(
    "fleet:open",
    (_event, id: unknown): AgentResponse<ServersConfig> => {
      const server = typeof id === "string" ? byId(id) : null;

      if (!server?.grant) {
        return refuse("bad_request", "refusal.fleet.unknown");
      }

      if (grantWithdrawn(server.grant)) {
        return refuse("entitlement_required", "refusal.fleet.withdrawn");
      }

      if (grantPending(server.grant)) {
        return refuse("bad_request", "refusal.fleet.pending");
      }

      return { ok: true, result: noteOpened(server.id) };
    }
  );

  /**
   * Give the list back the granted servers that were removed from here.
   *
   * The removal is this computer's decision, not the platform's: it still
   * grants them. Without this path, an accidental removal would be final.
   */
  ipcMain.handle(
    "fleet:restore",
    (): AgentResponse<ServersConfig> => ({ ok: true, result: restore() })
  );
}
