import { existsSync, readFileSync } from "node:fs";
import { account, deviceKeyPath } from "./account";
import { handle } from "./ipc";
import { isString, shape } from "./ipc-guard";
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
  handle("key-approvals:list", shape(), () => keyApprovals.list());

  handle(
    "key-approvals:approve",
    shape(isString, isString),
    (_event, serverId, deviceId) => keyApprovals.approve(serverId, deviceId)
  );
}
