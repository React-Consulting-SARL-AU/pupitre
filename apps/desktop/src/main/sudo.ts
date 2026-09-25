import type { Event } from "@pupitre/shared/agent-protocol/envelope";
import type { SudoOutcome, SudoPasswordState } from "@shared/sudo";
import { clipboard } from "electron";
import { agentClient } from "./agent";
import { handle } from "./ipc";
import { isString, shape } from "./ipc-guard";
import { refusalOf } from "./refusal";
import { byId } from "./servers";
import { offerSudoPassword, sudoVault as vault } from "./sudo-held";
import { enterSudoPassword, setSudoPassword } from "./sudo-run";

// A copy never brings the password across the bridge: the clipboard is written on this side.

export function securingSudo(
  serverId: string,
  onEvent: (event: Event) => void
): Promise<SudoOutcome> {
  return setSudoPassword(serverId, onEvent, { client: agentClient, vault });
}

export function forgetSudoPassword(serverId: string): void {
  vault.forget(serverId);
  agentClient.resetPrivileged(serverId);
}

function known(serverId: string): boolean {
  return byId(serverId) !== null;
}

export function registerSudo(): void {
  handle(
    "sudo:state",
    shape(isString),
    (_event, serverId): SudoPasswordState =>
      known(serverId) ? vault.state(serverId) : { held: false, kept: false }
  );

  handle("sudo:reveal", shape(isString), (_event, serverId): string | null =>
    known(serverId) ? vault.password(serverId) : null
  );

  handle("sudo:copy", shape(isString), (_event, serverId): boolean => {
    const password = known(serverId) ? vault.password(serverId) : null;

    if (password === null) {
      return false;
    }

    clipboard.writeText(password);

    return true;
  });

  handle(
    "sudo:enter",
    shape(isString, isString),
    (_event, serverId, password): Promise<SudoOutcome> => {
      if (!known(serverId)) {
        return Promise.resolve({
          error: refusalOf("bad_request", "refusal.server.unknown"),
          ok: false,
        });
      }

      if (password.length === 0) {
        return Promise.resolve({
          error: refusalOf("bad_request", "refusal.sudo.empty"),
          ok: false,
        });
      }

      return enterSudoPassword(serverId, password, {
        client: agentClient,
        offer: offerSudoPassword,
        vault,
      });
    }
  );
}
