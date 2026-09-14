import { editorById, remoteEditorUrl } from "@shared/editors";
import { ipcMain } from "electron";
import { agentClient } from "./agent";
import { releaseHostname } from "./connections";
import { openOutside } from "./foreground";
import {
  actOnProject,
  addProject,
  checkoutProject,
  diffProject,
  listProjects,
  onProject,
  type PlainProjectCommand,
  type ProjectDeps,
  projectEnv,
  projectLogs,
  updateProject,
} from "./projects-run";
import { refusalOf } from "./refusal";
import { relayTo } from "./relay";
import { byId } from "./servers";

/**
 * The project commands, wired to this machine's servers.
 *
 * `projects-run.ts` knows nothing of Electron so it can be replayed against the
 * fake agent; what belongs here is the channel and the configuration it reads.
 */

const PLAIN: readonly PlainProjectCommand[] = [
  "project.install",
  "project.pull",
  "project.sync",
  "project.url",
  "project.branches",
  "project.git_status",
  "project.working_tree",
  "project.remove",
];

export function registerProjects(): void {
  const deps: ProjectDeps = {
    client: agentClient,
    knows: (serverId) => Boolean(byId(serverId)),
    release: (serverId, hostname) => releaseHostname(serverId, hostname),
  };

  ipcMain.handle("project:list", (_event, serverId: unknown) =>
    listProjects(serverId, deps)
  );

  ipcMain.handle("project:add", (_event, serverId: unknown, params: unknown) =>
    addProject(serverId, params, deps)
  );

  ipcMain.handle(
    "project:update",
    (_event, serverId: unknown, params: unknown) =>
      updateProject(serverId, params, deps)
  );

  ipcMain.handle(
    "project:on",
    (_event, cmd: unknown, serverId: unknown, name: unknown) =>
      PLAIN.includes(cmd as PlainProjectCommand)
        ? onProject(cmd as PlainProjectCommand, serverId, name, deps)
        : Promise.resolve({
            error: refusalOf(
              "unknown_command",
              "refusal.project.command.unknown",
              { cmd: String(cmd) }
            ),
            ok: false as const,
          })
  );

  ipcMain.handle(
    "project:act",
    (
      _event,
      action: unknown,
      serverId: unknown,
      name: unknown,
      process: unknown
    ) => actOnProject(action, serverId, name, process, deps)
  );

  ipcMain.handle(
    "project:checkout",
    (_event, serverId: unknown, name: unknown, branch: unknown) =>
      checkoutProject(serverId, name, branch, deps)
  );

  ipcMain.handle(
    "project:env",
    (
      _event,
      serverId: unknown,
      name: unknown,
      force: unknown,
      process: unknown
    ) => projectEnv(serverId, name, force === true, process, deps)
  );

  ipcMain.handle(
    "project:diff",
    (_event, serverId: unknown, name: unknown, path: unknown) =>
      diffProject(serverId, name, path, deps)
  );

  /**
   * The folder opens in an editor of this computer, never of the server.
   *
   * The absolute path is the one the agent gave for that project's repository;
   * the address, the port and the account come from the app's own server list.
   * Neither is a string the renderer chose.
   */
  ipcMain.handle(
    "project:editor",
    (_event, serverId: unknown, editorId: unknown, path: unknown) => {
      const server = typeof serverId === "string" ? byId(serverId) : null;
      const editor = typeof editorId === "string" ? editorById(editorId) : null;

      if (!(server && editor && typeof path === "string")) {
        return;
      }

      const url = remoteEditorUrl(editor, server, path);

      if (url) {
        openOutside(url);
      }
    }
  );

  /**
   * A followed journal is held by its token for as long as it runs: the
   * renderer that opened it is the one that may end it, and it names it the
   * way it named its events.
   */
  const followers = new Map<string, AbortController>();

  ipcMain.handle(
    "project:logs",
    async (
      event,
      token: unknown,
      serverId: unknown,
      name: unknown,
      process: unknown,
      lines: unknown,
      follow: unknown
    ) => {
      const control = new AbortController();

      if (typeof token === "string") {
        followers.set(token, control);
      }

      try {
        return await projectLogs(
          serverId,
          name,
          process,
          lines,
          follow === true,
          relayTo<string>(event.sender, token, "project:log-line", "line"),
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

  ipcMain.on("project:logs-cancel", (_event, token: unknown) => {
    if (typeof token === "string") {
      followers.get(token)?.abort();
    }
  });
}
