import { join } from "node:path";
import { app, clipboard, ipcMain } from "electron";
import { agentClient } from "./agent";
import { broadcast } from "./broadcast";
import { forgetShells, reserveDatabaseShell } from "./db-shell";
import { forwardMemory } from "./forwards-memory";
import {
  closeForward,
  closeForwards,
  type ForwardDeps,
  forwards,
  openForward,
  watchForwards,
} from "./port-forward";
import { relayTo } from "./relay";
import { byId, paths } from "./servers";
import {
  credentialValue,
  declaresService,
  forgetCredentials,
  forgetServices,
  readDatabaseUrl,
  readService,
  type ServicesDeps,
  serviceLogs,
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
  declares: declaresService,
  knows: (serverId) => Boolean(byId(serverId)),
};

let memory: ForwardDeps["memory"];

export const forwardDeps: ForwardDeps = {
  get memory() {
    memory ??= forwardMemory(join(app.getPath("userData"), "forwards.json"));

    return memory;
  },
  resolve: (serverId) => {
    const server = byId(serverId);

    return server ? sshArgs(server, paths()) : null;
  },
};

export function forgetServiceCredentials(serverId?: string): void {
  forgetCredentials(serverId);
  forgetServices(serverId);
  closeForwards(serverId);
  forgetShells(serverId);
}

export function registerServices(): void {
  watchForwards((list) => broadcast("service:forwards-changed", list));

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
    ): Promise<string | null> =>
      credentialValue(serverId, moduleId, label, deps)
  );

  /**
   * The copy is done here rather than in the renderer, so that pasting a
   * password somewhere else never means holding it on this side of the bridge.
   */
  ipcMain.handle(
    "service:credential-copy",
    async (
      _event,
      serverId: unknown,
      moduleId: unknown,
      label: unknown
    ): Promise<boolean> => {
      const value = await credentialValue(serverId, moduleId, label, deps);

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

  /**
   * The shell of a database is a command the agent composes and the main
   * process runs: the renderer gets back the tab to open, never the line.
   */
  ipcMain.handle(
    "service:db-shell",
    (_event, serverId: unknown, moduleId: unknown, name: unknown) =>
      reserveDatabaseShell(serverId, moduleId, name, deps)
  );

  /**
   * A followed journal is held by its token for as long as it runs: the
   * renderer that opened it is the one that may end it.
   */
  const followers = new Map<string, AbortController>();

  ipcMain.handle(
    "service:logs",
    async (
      event,
      token: unknown,
      serverId: unknown,
      moduleId: unknown,
      lines: unknown,
      follow: unknown
    ) => {
      const control = new AbortController();

      if (typeof token === "string") {
        followers.set(token, control);
      }

      try {
        return await serviceLogs(
          serverId,
          moduleId,
          lines,
          follow === true,
          relayTo<string>(event.sender, token, "service:log-line", "line"),
          deps,
          control.signal
        );
      } finally {
        if (typeof token === "string") {
          followers.delete(token);
        }
      }
    }
  );

  ipcMain.on("service:logs-cancel", (_event, token: unknown) => {
    if (typeof token === "string") {
      followers.get(token)?.abort();
    }
  });
}
