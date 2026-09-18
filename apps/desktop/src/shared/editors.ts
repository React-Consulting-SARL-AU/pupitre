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
  /** The module whose logo is this editor's mark: Cursor's is its agent's, not the server's. */
  logo: string;
  /**
   * Whether the link has to name the folder the module laid on the server.
   *
   * Gateway refuses a link that says neither where the backend is nor which
   * one to download; the module put it there, and only the agent's `path`
   * says where. Until it does, there is no link to hand, and no mark.
   */
  backend: boolean;
}

/** A module the agent listed, and the folder it laid when the link needs one. */
export interface LaidModule {
  id: string;
  path?: string;
}

/**
 * `editor.vscode` lays the server VS Code, Cursor and Windsurf all reuse: one
 * module, two buttons, because the two applications are installed separately on
 * this side and only the reader knows which one they run.
 */
export const REMOTE_EDITORS: readonly RemoteEditor[] = [
  {
    backend: true,
    id: "jetbrains",
    logo: "editor.jetbrains",
    module: "editor.jetbrains",
    name: "JetBrains Gateway",
  },
  {
    backend: false,
    id: "vscode",
    logo: "editor.vscode",
    module: "editor.vscode",
    name: "VS Code",
  },
  {
    backend: false,
    id: "cursor",
    logo: "ai.cursor",
    module: "editor.vscode",
    name: "Cursor",
  },
  {
    backend: false,
    id: "zed",
    logo: "editor.zed",
    module: "editor.zed",
    name: "Zed",
  },
];

export function editorsFor(installed: readonly LaidModule[]): RemoteEditor[] {
  return REMOTE_EDITORS.filter((editor) => {
    const module = installed.find((laid) => laid.id === editor.module);

    return module !== undefined && (!editor.backend || Boolean(module.path));
  });
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
 * the account anyway, and gets the ones the block says — and the backend the
 * module laid, as `idePath`, so it opens that one rather than downloading its
 * own or refusing the link.
 */
export function remoteEditorUrl(
  editor: RemoteEditor,
  server: Server,
  name: string,
  path: string,
  backend: string | null = null
): string | null {
  if (!PATH_OK.test(path) || (editor.backend && !backend)) {
    return null;
  }

  const port = server.origin === "system" ? 22 : server.port;
  const user = server.origin === "system" ? "" : server.user;

  switch (editor.id) {
    case "jetbrains":
      return `jetbrains-gateway://connect#type=ssh&host=${encodeURIComponent(name)}&port=${port}&user=${encodeURIComponent(user)}&projectPath=${encodeURIComponent(path)}&idePath=${encodeURIComponent(backend ?? "")}&deploy=false`;
    case "vscode":
      return `vscode://vscode-remote/ssh-remote+${name}${path}`;
    case "cursor":
      return `cursor://vscode-remote/ssh-remote+${name}${path}`;
    default:
      return `zed://ssh/${name}${path}`;
  }
}
