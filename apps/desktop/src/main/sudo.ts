import type { Event } from "@pupitre/shared/agent-protocol/envelope";
import type { SudoOutcome, SudoPasswordState } from "@shared/sudo";
import { clipboard, ipcMain } from "electron";
import { agentClient } from "./agent";
import { refusalOf } from "./refusal";
import { byId } from "./servers";
import { offerSudoPassword, sudoVault as vault } from "./sudo-held";
import { enterSudoPassword, setSudoPassword } from "./sudo-run";

/**
 * The sudo password of each server, seen from the main process.
 *
 * The renderer names a server; the password comes across only for the reveal
 * the reader asked for, or once when the reader types it, and a copy never
 * brings it across at all — the clipboard is written on this side.
 */

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

function known(serverId: unknown): serverId is string {
  return typeof serverId === "string" && byId(serverId) !== null;
}

export function registerSudo(): void {
  ipcMain.handle(
    "sudo:state",
    (_event, serverId: unknown): SudoPasswordState =>
      known(serverId) ? vault.state(serverId) : { held: false, kept: false }
  );

  ipcMain.handle("sudo:reveal", (_event, serverId: unknown): string | null =>
    known(serverId) ? vault.password(serverId) : null
  );

  ipcMain.handle("sudo:copy", (_event, serverId: unknown): boolean => {
    const password = known(serverId) ? vault.password(serverId) : null;

    if (password === null) {
      return false;
    }

    clipboard.writeText(password);

    return true;
  });

  ipcMain.handle(
    "sudo:enter",
    (_event, serverId: unknown, password: unknown): Promise<SudoOutcome> => {
      if (!known(serverId)) {
        return Promise.resolve({
          error: refusalOf("bad_request", "refusal.server.unknown"),
          ok: false,
        });
      }

      if (typeof password !== "string" || password.length === 0) {
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
