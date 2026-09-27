import { hostname } from "node:os";
import { join } from "node:path";
import { app, clipboard, safeStorage } from "electron";
import {
  type AccessDeps,
  copyKey,
  createKey,
  heldKeys,
  openAddress,
  revokeKey,
} from "./access-run";
import { createAccessVault } from "./access-vault";
import { agentClient } from "./agent";
import { openOutside } from "./foreground";
import { handle } from "./ipc";
import { anything, shape } from "./ipc-guard";
import { keychainSealer } from "./keychain";
import { guardedBy } from "./projects-run";
import { byId } from "./servers";

const vault = createAccessVault({
  dir: join(app.getPath("userData"), "access"),
  sealer: keychainSealer(safeStorage, process.platform),
});

const BONJOUR_SUFFIX = /\.local$/;

function deviceName(): string {
  return hostname().replace(BONJOUR_SUFFIX, "") || "Pupitre";
}

const deps: AccessDeps = {
  copy: (text) => clipboard.writeText(text),
  deviceName,
  guardedBy,
  knows: (serverId) => byId(serverId) !== null,
  open: openOutside,
  request: (serverId, cmd, params) =>
    agentClient.request(serverId, cmd, params as never),
  vault,
};

export function forgetAccess(serverId: string): void {
  vault.clear(serverId);
}

export function registerAccess(): void {
  handle(
    "access:create",
    shape(anything, anything, anything),
    (_event, serverId, name, projects) =>
      createKey(serverId, name, projects, deps)
  );

  handle("access:revoke", shape(anything, anything), (_event, serverId, id) =>
    revokeKey(serverId, id, deps)
  );

  handle("access:held", shape(anything, anything), (_event, serverId, listed) =>
    heldKeys(serverId, listed, deps)
  );

  handle(
    "access:copy",
    shape(anything, anything, anything, anything),
    (_event, serverId, id, form, name) =>
      copyKey(serverId, id, form, name, deps)
  );

  handle(
    "access:open",
    shape(anything, anything),
    (_event, serverId, address) => openAddress(serverId, address, deps)
  );
}
