import { ipcMain } from "electron";
import { agentClient } from "./agent";
import {
  addProject,
  installProject,
  listProjects,
  type ProjectDeps,
  projectLogs,
  projectUrl,
  startProject,
  syncProject,
} from "./projects-run";
import { byId } from "./servers";

/**
 * The project commands, wired to this machine's servers.
 *
 * `projects-run.ts` knows nothing of Electron so it can be replayed against the
 * fake agent; what belongs here is the channel and the configuration it reads.
 */
export function registerProjects(): void {
  const deps: ProjectDeps = {
    client: agentClient,
    knows: (serverId) => Boolean(byId(serverId)),
  };

  ipcMain.handle("project:list", (_event, serverId: unknown) =>
    listProjects(serverId, deps)
  );

  ipcMain.handle("project:add", (_event, serverId: unknown, params: unknown) =>
    addProject(serverId, params, deps)
  );

  ipcMain.handle("project:sync", (_event, serverId: unknown, name: unknown) =>
    syncProject(serverId, name, deps)
  );

  ipcMain.handle(
    "project:install",
    (_event, serverId: unknown, name: unknown) =>
      installProject(serverId, name, deps)
  );

  ipcMain.handle("project:up", (_event, serverId: unknown, name: unknown) =>
    startProject(serverId, name, deps)
  );

  ipcMain.handle("project:url", (_event, serverId: unknown, name: unknown) =>
    projectUrl(serverId, name, deps)
  );

  ipcMain.handle(
    "project:logs",
    (
      event,
      token: unknown,
      serverId: unknown,
      name: unknown,
      lines: unknown,
      follow: unknown
    ) =>
      projectLogs(
        serverId,
        name,
        lines,
        follow === true,
        (line) => {
          if (typeof token === "string" && !event.sender.isDestroyed()) {
            event.sender.send("project:log-line", { line, token });
          }
        },
        deps
      )
  );
}
