import type { AgentResponse } from "@shared/agent";
import type { HardenOutcome, HardenUpdate } from "@shared/harden";
import { account } from "./account";
import { agentClient } from "./agent";
import { runSecuring } from "./harden-run";
import { handle } from "./ipc";
import { isString, shape } from "./ipc-guard";
import { refusalOf } from "./refusal";
import { relayTo } from "./relay";
import { byId, switchAccount } from "./servers";
import { securingSudo } from "./sudo";
import { usageRefusal } from "./usage-guard";

// The renderer names a server only: the protocol fixes the account at `dev`, so no typed name becomes one on the machine.
export function registerHarden(): void {
  handle(
    "harden:start",
    shape(isString, isString),
    async (event, token, serverId): Promise<AgentResponse<HardenOutcome>> => {
      if (!byId(serverId)) {
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
