import type { Server } from "./servers";

/**
 * The remote editors a server can be opened in, and only those it installed.
 *
 * The app holds no preference: what the agent reports as an installed module is
 * what the buttons offer. A module the machine does not have is not an editor
 * the reader can be sent to — the click would open an application that has
 * never heard of that host.
 */

export type RemoteEditorId = "jetbrains" | "vscode" | "cursor" | "zed";

export type RemoteEditor = {
  id: RemoteEditorId;
  name: string;
  /** The catalogue module whose presence makes this editor reachable. */
  module: string;
};

/**
 * `editor.vscode` lays the server VS Code, Cursor and Windsurf all reuse: one
 * module, two buttons, because the two applications are installed separately on
 * this side and only the reader knows which one they run.
 */
export const REMOTE_EDITORS: readonly RemoteEditor[] = [
  { id: "jetbrains", module: "editor.jetbrains", name: "JetBrains Gateway" },
  { id: "vscode", module: "editor.vscode", name: "VS Code" },
  { id: "cursor", module: "editor.vscode", name: "Cursor" },
  { id: "zed", module: "editor.zed", name: "Zed" },
];

export function editorsFor(
  installedModules: readonly string[]
): RemoteEditor[] {
  return REMOTE_EDITORS.filter((editor) =>
    installedModules.includes(editor.module)
  );
}

export function editorById(id: string): RemoteEditor | null {
  return REMOTE_EDITORS.find((editor) => editor.id === id) ?? null;
}

/** An absolute remote folder, and nothing that could climb out of one. */
const PATH_OK = /^\/[\w.\-/+@]{0,240}$/;

/**
 * The account these editors connect as.
 *
 * A server of the app carries its own; a host taken from ~/.ssh/config is named
 * by its alias alone, and the editor reads that file the way ssh does.
 */
function destination(server: Server): string {
  return server.user ? `${server.user}@${server.host}` : server.host;
}

export function remoteEditorUrl(
  editor: RemoteEditor,
  server: Server,
  path: string
): string | null {
  if (!PATH_OK.test(path)) {
    return null;
  }

  const host = destination(server);
  const port = server.origin === "system" ? 22 : server.port;

  switch (editor.id) {
    case "jetbrains":
      return `jetbrains-gateway://connect#type=ssh&host=${encodeURIComponent(server.host)}&port=${port}&user=${encodeURIComponent(server.user)}&projectPath=${encodeURIComponent(path)}`;
    case "vscode":
      return `vscode://vscode-remote/ssh-remote+${host}${path}`;
    case "cursor":
      return `cursor://vscode-remote/ssh-remote+${host}${path}`;
    default:
      return `zed://ssh/${host}${path}`;
  }
}
