import { clipboard, ipcMain } from "electron";
import { agentClient } from "./agent";
import {
  closeForward,
  closeForwards,
  type ForwardDeps,
  forwards,
  openForward,
} from "./port-forward";
import { byId, paths } from "./servers";
import {
  credentialValue,
  forgetCredentials,
  readDatabaseUrl,
  readService,
  type ServicesDeps,
} from "./services-run";
import { sshArgs } from "./ssh-config";

/**
 * The Services screen, seen from the main process.
 *
 * Two things never cross the bridge: a credential's value, and the arguments of
 * an `ssh`. The renderer names a server, a module and a label; what those become
 * is decided here, against the configuration and against what the agent itself
 * has just answered.
 */

const deps: ServicesDeps = {
  client: agentClient,
  knows: (serverId) => Boolean(byId(serverId)),
};

const forwardDeps: ForwardDeps = {
  resolve: (serverId) => {
    const server = byId(serverId);

    return server ? sshArgs(server, paths()) : null;
  },
};

export function forgetServiceCredentials(serverId?: string): void {
  forgetCredentials(serverId);
  closeForwards(serverId);
}

export function registerServices(): void {
  ipcMain.handle(
    "service:detail",
    (_event, serverId: unknown, moduleId: unknown) =>
      readService(serverId, moduleId, deps)
  );

  ipcMain.handle(
    "service:db-url",
    (_event, serverId: unknown, moduleId: unknown, name: unknown) =>
      readDatabaseUrl(serverId, moduleId, name, deps)
  );

  /**
   * The one way a credential leaves the main process: shown once, to the reader
   * who asked, in a component that drops it when the panel closes.
   */
  ipcMain.handle(
    "service:credential-reveal",
    (
      _event,
      serverId: unknown,
      moduleId: unknown,
      label: unknown
    ): string | null => credentialValue(serverId, moduleId, label)
  );

  /**
   * The copy is done here rather than in the renderer, so that pasting a
   * password somewhere else never means holding it on this side of the bridge.
   */
  ipcMain.handle(
    "service:credential-copy",
    (_event, serverId: unknown, moduleId: unknown, label: unknown): boolean => {
      const value = credentialValue(serverId, moduleId, label);

      if (value === null) {
        return false;
      }

      clipboard.writeText(value);

      return true;
    }
  );

  ipcMain.handle(
    "service:forget",
    (_event, serverId: unknown, moduleId: unknown) =>
      forgetCredentials(
        typeof serverId === "string" ? serverId : undefined,
        typeof moduleId === "string" ? moduleId : undefined
      )
  );

  ipcMain.handle(
    "service:forward-open",
    (_event, serverId: unknown, remotePort: unknown, label: unknown) =>
      openForward(serverId, remotePort, label, forwardDeps)
  );

  ipcMain.handle("service:forward-close", (_event, id: unknown) =>
    closeForward(id)
  );

  ipcMain.handle("service:forwards", (_event, serverId: unknown) =>
    forwards(typeof serverId === "string" ? serverId : undefined)
  );
}
