import { join } from "node:path";
import { app, safeStorage } from "electron";
import { keychainSealer } from "./keychain";
import { createSudoVault } from "./sudo-vault";

/**
 * The sudo password of each server as the privileged channel reads it: the
 * one this computer keeps, or the one being tried before it is kept.
 */

export const sudoVault = createSudoVault({
  dir: join(app.getPath("userData"), "sudo"),
  sealer: keychainSealer(safeStorage, process.platform),
});

const offered = new Map<string, string>();

export function offerSudoPassword(
  serverId: string,
  password: string | null
): void {
  if (password === null) {
    offered.delete(serverId);

    return;
  }

  offered.set(serverId, password);
}

export function sudoPasswordFor(serverId: string): string | null {
  return offered.get(serverId) ?? sudoVault.password(serverId);
}
