import { existsSync, readFileSync } from "node:fs";
import { ipcMain } from "electron";
import { account, deviceKeyPath } from "./account";
import { createKeyApprovals, sshKeygenSigner } from "./key-approvals-run";

function devicePublicKey(): string | null {
  const path = `${deviceKeyPath()}.pub`;

  return existsSync(path) ? readFileSync(path, "utf8").trim() : null;
}

const keyApprovals = createKeyApprovals({
  account,
  deviceKeyPath,
  devicePublicKey,
  now: () => new Date(),
  sign: sshKeygenSigner(),
});

export function registerKeyApprovals(): void {
  ipcMain.handle("key-approvals:list", () => keyApprovals.list());

  ipcMain.handle(
    "key-approvals:approve",
    (_event, serverId: unknown, deviceId: unknown) =>
      keyApprovals.approve(serverId, deviceId)
  );
}
