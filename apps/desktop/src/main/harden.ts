import type { AgentResponse } from "@shared/agent";
import type { HardenOutcome, HardenUpdate } from "@shared/harden";
import { ipcMain } from "electron";
import { account } from "./account";
import { agentClient } from "./agent";
import { runHarden } from "./harden-run";
import { byId, switchAccount } from "./servers";
import { usageRefusal } from "./usage-guard";

/**
 * The hardening screen, seen from the main process.
 *
 * The renderer names a server and nothing else: the account to open is fixed by
 * the protocol at `dev`, so no name typed in the interface ever becomes one on
 * the machine. What comes back is the agent's own answer, plus what the app did
 * with its own SSH configuration.
 */
export function registerHarden(): void {
  ipcMain.handle(
    "harden:start",
    async (
      event,
      token: unknown,
      serverId: unknown
    ): Promise<AgentResponse<HardenOutcome>> => {
      if (typeof serverId !== "string" || !byId(serverId)) {
        return {
          ok: false,
          error: {
            code: "bad_request",
            fix: "Choisis un serveur dans les réglages.",
            message: "Ce serveur n'est plus dans la liste.",
          },
        };
      }

      const refused = usageRefusal(() => account.guard());

      if (refused) {
        return refused;
      }

      const update = (change: HardenUpdate) => {
        if (typeof token === "string" && !event.sender.isDestroyed()) {
          event.sender.send("harden:update", { token, update: change });
        }
      };

      return await runHarden(serverId, update, {
        client: agentClient,
        close: (id) => agentClient.close(id),
        switchUser: switchAccount,
      });
    }
  );
}
