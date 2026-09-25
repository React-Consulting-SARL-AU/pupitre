import type { Server } from "./servers";

export type RemoteEditorId = "jetbrains" | "vscode" | "cursor" | "zed";

export interface RemoteEditor {
  id: RemoteEditorId;
  name: string;
  module: string;
  /** Cursor's mark is its agent module's logo, not the server module's. */
  logo: string;
  /** Gateway refuses a link that names neither the backend folder nor one to download. */
  backend: boolean;
}

export interface LaidModule {
  id: string;
  path?: string;
}

/** VS Code and Cursor share the `editor.vscode` server; only the reader knows which app they run locally. */
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

const PATH_OK = /^\/[\w.\-/+@]{0,240}$/;

/** The SSH alias carries account, port and keys; Gateway still insists on port and user in the link. */
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
