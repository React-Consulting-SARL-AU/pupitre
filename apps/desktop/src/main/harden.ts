import type { AgentResponse } from "@shared/agent";
import type { HardenOutcome, HardenUpdate } from "@shared/harden";
import { ipcMain } from "electron";
import { account } from "./account";
import { agentClient } from "./agent";
import { runSecuring } from "./harden-run";
import { refusalOf } from "./refusal";
import { relayTo } from "./relay";
import { byId, switchAccount } from "./servers";
import { securingSudo } from "./sudo";
import { usageRefusal } from "./usage-guard";

/**
 * The hardening screen, seen from the main process.
 *
 * The renderer names a server and nothing else: the account to open is fixed by
 * the protocol at `dev`, so no name typed in the interface ever becomes one on
 * the machine. What comes back is the agent's own answer, plus what the app did
 * with its own SSH configuration and the sudo password it set.
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
            ...refusalOf("bad_request", "refusal.server.unknown"),
          },
        };
      }

      const refused = usageRefusal(() => account.guard());

      if (refused) {
        return refused;
      }

      const update = relayTo<HardenUpdate>(
        event.sender,
        token,
        "harden:update",
        "update"
      );

      return await runSecuring(serverId, update, {
        client: agentClient,
        close: (id) => agentClient.close(id),
        sudo: securingSudo,
        switchUser: switchAccount,
        user: (id) => byId(id)?.user ?? null,
      });
    }
  );
}
