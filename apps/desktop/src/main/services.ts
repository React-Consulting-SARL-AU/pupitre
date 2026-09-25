import { join } from "node:path";
import { app, clipboard } from "electron";
import { agentClient } from "./agent";
import { broadcast } from "./broadcast";
import { forgetShells, reserveDatabaseShell } from "./db-shell";
import { forwardMemory } from "./forwards-memory";
import { handle, listen } from "./ipc";
import { anything, isBoolean, isString, shape } from "./ipc-guard";
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

function isStringOrNull(value: unknown): value is string | null {
  return value === null || isString(value);
}

export function forgetServiceCredentials(serverId?: string): void {
  forgetCredentials(serverId);
  forgetServices(serverId);
  closeForwards(serverId);
  forgetShells(serverId);
}

export function registerServices(): void {
  watchForwards((list) => broadcast("service:forwards-changed", list));

  handle(
    "service:detail",
    shape(anything, anything),
    (_event, serverId, moduleId) => readService(serverId, moduleId, deps)
  );

  handle(
    "service:db-url",
    shape(anything, anything, anything),
    (_event, serverId, moduleId, name) =>
      readDatabaseUrl(serverId, moduleId, name, deps)
  );

  handle(
    "service:credential-reveal",
    shape(isString, isString, isString),
    (_event, serverId, moduleId, label): Promise<string | null> =>
      credentialValue(serverId, moduleId, label, deps)
  );

  // Copied here so that a password never sits on the renderer's side of the bridge.
  handle(
    "service:credential-copy",
    shape(isString, isString, isString),
    async (_event, serverId, moduleId, label): Promise<boolean> => {
      const value = await credentialValue(serverId, moduleId, label, deps);

      if (value === null) {
        return false;
      }

      clipboard.writeText(value);

      return true;
    }
  );

  handle(
    "service:forget",
    shape(isString, isStringOrNull),
    (_event, serverId, moduleId) =>
      forgetCredentials(serverId, moduleId ?? undefined)
  );

  handle(
    "service:forward-open",
    shape(anything, anything, anything),
    (_event, serverId, remotePort, label) =>
      openForward(serverId, remotePort, label, forwardDeps)
  );

  handle("service:forward-close", shape(isString), (_event, id) =>
    closeForward(id)
  );

  handle("service:forwards", shape(isStringOrNull), (_event, serverId) =>
    forwards(serverId ?? undefined)
  );

  handle(
    "service:db-shell",
    shape(anything, anything, anything),
    (_event, serverId, moduleId, name) =>
      reserveDatabaseShell(serverId, moduleId, name, deps)
  );

  const followers = new Map<string, AbortController>();

  handle(
    "service:logs",
    shape(isString, anything, anything, anything, isBoolean),
    async (event, token, serverId, moduleId, lines, follow) => {
      const control = new AbortController();

      followers.set(token, control);

      try {
        return await serviceLogs(
          serverId,
          moduleId,
          lines,
          follow,
          relayTo<string>(event.sender, token, "service:log-line", "line"),
          deps,
          control.signal
        );
      } finally {
        followers.delete(token);
      }
    }
  );

  listen("service:logs-cancel", shape(isString), (_event, token) => {
    followers.get(token)?.abort();
  });
}
