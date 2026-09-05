import type { AgentErrorCode, AgentResponse } from "@shared/agent";
import type { FleetView, ServersConfig } from "@shared/servers";
import { grantPending, grantWithdrawn } from "@shared/servers";
import { ipcMain } from "electron";
import { account, deviceKey, deviceKeyPath } from "./account";
import { asAgentError } from "./enrollment-run";
import { mergeFleet } from "./fleet-run";
import { byId, noteOpened, read, write } from "./servers";

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
  message: string,
  fix: string
): AgentResponse<never> {
  return { ok: false, error: { code, fix, message } };
}

export function registerFleet(
  settle: (config: ServersConfig) => ServersConfig
): void {
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
      granted: granted.result,
      local: config.servers,
    });

    return {
      ok: true,
      result: {
        adopted: merged.adopted,
        changed: merged.changed,
        config: merged.changed ? settle(write(merged.config)) : config,
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
        return refuse(
          "bad_request",
          "Ce serveur n'est plus dans la liste.",
          "Recharge les serveurs de ton organisation depuis les réglages."
        );
      }

      if (grantWithdrawn(server.grant)) {
        return refuse(
          "entitlement_required",
          "Ce serveur ne t'est plus attribué.",
          "Demande à un administrateur de ton organisation de te l'attribuer à nouveau."
        );
      }

      if (grantPending(server.grant)) {
        return refuse(
          "bad_request",
          "La plateforme n'a pas encore posé ta clé sur ce serveur.",
          "Laisse la fenêtre ouverte : l'app réessaie toute seule."
        );
      }

      return { ok: true, result: settle(noteOpened(server.id)) };
    }
  );
}
