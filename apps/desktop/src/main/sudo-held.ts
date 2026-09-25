import { join } from "node:path";
import { app, safeStorage } from "electron";
import { keychainSealer } from "./keychain";
import { createSudoVault } from "./sudo-vault";

export const sudoVault = createSudoVault({
  dir: join(app.getPath("userData"), "sudo"),
  sealer: keychainSealer(safeStorage, process.platform),
});

/** A password being tried on the privileged channel before it is kept in the vault. */
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
