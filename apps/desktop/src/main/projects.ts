import { editorById, remoteEditorUrl } from "@shared/editors";
import { agentClient } from "./agent";
import { connectionToken, releaseHostname } from "./connections";
import { openOutside } from "./foreground";
import { githubRepos } from "./github";
import { handle, listen } from "./ipc";
import { anything, isBoolean, isString, optional, shape } from "./ipc-guard";
import {
  actOnProject,
  addProject,
  checkoutProject,
  diffProject,
  editorFolder,
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
import { byId, sshNameOf } from "./servers";
import { servicePath } from "./services-run";

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

function isPlainCommand(cmd: unknown): cmd is PlainProjectCommand {
  return PLAIN.includes(cmd as PlainProjectCommand);
}

export function registerProjects({
  root,
}: {
  root: (serverId: string) => Promise<string | null>;
}): void {
  const deps: ProjectDeps = {
    client: agentClient,
    knows: (serverId) => Boolean(byId(serverId)),
    release: (serverId, hostname) => releaseHostname(serverId, hostname),
  };

  handle("project:list", shape(anything), (_event, serverId) =>
    listProjects(serverId, deps)
  );

  handle("github:repos", shape(optional(isBoolean)), (_event, refresh) =>
    githubRepos(connectionToken("github"), refresh ?? false)
  );

  handle("project:add", shape(anything, anything), (_event, serverId, params) =>
    addProject(serverId, params, deps)
  );

  handle(
    "project:update",
    shape(anything, anything),
    (_event, serverId, params) => updateProject(serverId, params, deps)
  );

  handle(
    "project:on",
    shape(anything, anything, anything),
    (_event, cmd, serverId, name) =>
      isPlainCommand(cmd)
        ? onProject(cmd, serverId, name, deps)
        : Promise.resolve({
            error: refusalOf(
              "unknown_command",
              "refusal.project.command.unknown",
              { cmd: String(cmd) }
            ),
            ok: false as const,
          })
  );

  handle(
    "project:act",
    shape(anything, anything, anything, anything),
    (_event, action, serverId, name, process) =>
      actOnProject(action, serverId, name, process, deps)
  );

  handle(
    "project:checkout",
    shape(anything, anything, anything),
    (_event, serverId, name, branch) =>
      checkoutProject(serverId, name, branch, deps)
  );

  handle(
    "project:env",
    shape(anything, anything, isBoolean, anything),
    (_event, serverId, name, force, process) =>
      projectEnv(serverId, name, force, process, deps)
  );

  handle(
    "project:diff",
    shape(anything, anything, anything),
    (_event, serverId, name, path) => diffProject(serverId, name, path, deps)
  );

  // The folder opens on this computer: the path is one the agent gave, the host one the app's server list names.
  handle(
    "project:editor",
    shape(isString, isString, anything),
    async (_event, serverId, editorId, path) => {
      const server = byId(serverId);
      const editor = editorById(editorId);
      const name = server ? sshNameOf(server.id) : null;

      if (!(server && editor && name)) {
        return;
      }

      const folder =
        editorFolder(server.id, path, null) ??
        editorFolder(server.id, path, await root(server.id));

      if (!folder) {
        return;
      }

      const url = remoteEditorUrl(
        editor,
        server,
        name,
        folder,
        servicePath(server.id, editor.module)
      );

      if (url) {
        openOutside(url);
      }
    }
  );

  const followers = new Map<string, AbortController>();

  handle(
    "project:logs",
    shape(isString, anything, anything, anything, anything, isBoolean),
    async (event, token, serverId, name, process, lines, follow) => {
      const control = new AbortController();

      followers.set(token, control);

      try {
        return await projectLogs(
          serverId,
          name,
          process,
          lines,
          follow,
          relayTo<string>(event.sender, token, "project:log-line", "line"),
          deps,
          control.signal
        );
      } finally {
        followers.delete(token);
      }
    }
  );

  listen("project:logs-cancel", shape(isString), (_event, token) => {
    followers.get(token)?.abort();
  });
}
