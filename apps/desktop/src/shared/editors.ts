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

export interface RemoteEditor {
  id: RemoteEditorId;
  name: string;
  /** The catalogue module whose presence makes this editor reachable. */
  module: string;
}

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
 * The link an editor opens, on the name the system's SSH file resolves.
 *
 * A server of the app is named by the word its block carries in the app's
 * file — which the system's file includes, once the reader asked for it — so
 * the account, the port, the key and the pinned host key all come from there
 * and none needs saying here. A host taken from ~/.ssh/config is named by its
 * alias alone, for the same reason. JetBrains Gateway asks for the port and
 * the account anyway, and gets the ones the block says.
 */
export function remoteEditorUrl(
  editor: RemoteEditor,
  server: Server,
  name: string,
  path: string
): string | null {
  if (!PATH_OK.test(path)) {
    return null;
  }

  const port = server.origin === "system" ? 22 : server.port;
  const user = server.origin === "system" ? "" : server.user;

  switch (editor.id) {
    case "jetbrains":
      return `jetbrains-gateway://connect#type=ssh&host=${encodeURIComponent(name)}&port=${port}&user=${encodeURIComponent(user)}&projectPath=${encodeURIComponent(path)}`;
    case "vscode":
      return `vscode://vscode-remote/ssh-remote+${name}${path}`;
    case "cursor":
      return `cursor://vscode-remote/ssh-remote+${name}${path}`;
    default:
      return `zed://ssh/${name}${path}`;
  }
}
