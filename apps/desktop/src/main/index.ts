import { join } from "node:path";
import { DARK, LIGHT } from "@pupitre/design/tokens";
import type { AgentResponse } from "@shared/agent";
import type {
  HostKeyDecision,
  ServerAdded,
  ServerDraft,
  ServersConfig,
} from "@shared/servers";
import type { TerminalOpened } from "@shared/terminals";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeTheme,
  shell,
} from "electron";
import { agentClient, registerAgentChannels } from "./agent";
import { registerCatalog } from "./catalog";
import { completions } from "./completion";
import { registerHarden } from "./harden";
import { registerInspection } from "./inspection";
import { registerInstall } from "./install";
import { closeLogin, moveLogin, openLogin } from "./login-view";
import { registerProjects } from "./projects";
import { declaresProject, forgetProjects, projectFolder } from "./projects-run";
import { registerSecrets } from "./secrets";
import { SetupError } from "./server-setup";
import {
  activate as activateServer,
  add as addServer,
  hostKey,
  publicKey,
  read,
  remove as removeServer,
  rename as renameServer,
  sshHosts,
  trustReinstalled,
  write as writeConfig,
} from "./servers";
import { forgetServiceCredentials, registerServices } from "./services";
import { terminalCommand } from "./terminal-run";
import {
  close,
  closeAll,
  forgetLogin,
  open,
  pendingLogin,
  resize,
  terminalDiagnostics,
  write,
} from "./terminals";
import { readBounds } from "./view-bounds";

let window: BrowserWindow | null = null;

/**
 * What has to be dropped whenever the server list changes.
 *
 * The channels were talking to the old servers and reopen on the new ones at
 * the next call; the project names the app was allowed to drive belonged to a
 * machine we may no longer be on.
 */
function settle(config: ServersConfig): ServersConfig {
  agentClient.closeAll();
  forgetProjects();
  forgetServiceCredentials();
  closeLogin();
  closeAll();

  return config;
}

/**
 * What the native window paints before the page does, and while it resizes.
 *
 * The main process has no stylesheet, so the value comes from the design tokens
 * as data. It follows the system: the theme forced in the settings lives in the
 * renderer, and this colour is only ever seen at the edges.
 */
function windowBackground(): string {
  return nativeTheme.shouldUseDarkColors ? DARK.base : LIGHT.base;
}

function createWindow(): void {
  window = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 940,
    minHeight: 560,
    show: false,
    titleBarStyle: "hiddenInset",
    backgroundColor: windowBackground(),
    icon: new URL("../../build/icon.png", import.meta.url).pathname,
    webPreferences: {
      preload: new URL("../preload/index.mjs", import.meta.url).pathname,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  window.on("ready-to-show", () => window?.show());

  nativeTheme.on("updated", () =>
    window?.setBackgroundColor(windowBackground())
  );

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) {
    window.loadURL(devUrl);
  } else {
    window.loadFile(
      new URL("../renderer/index.html", import.meta.url).pathname
    );
  }
}

function registerServerChannels(): void {
  ipcMain.handle("servers", (): ServersConfig => read());
  ipcMain.handle("ssh-hosts", (): string[] => sshHosts());
  ipcMain.handle("servers-write", (_e, config: ServersConfig) =>
    settle(writeConfig(config))
  );

  ipcMain.handle(
    "server-add",
    async (_e, draft: ServerDraft): Promise<AgentResponse<ServerAdded>> => {
      try {
        const created = await addServer(draft);

        return {
          ok: true,
          result: {
            config: settle(read()),
            copyId: created.copyId,
            publicKey: created.publicKey,
            server: created.server,
          },
        };
      } catch (error) {
        return error instanceof SetupError
          ? {
              ok: false,
              error: {
                code: "bad_request",
                fix: error.fix,
                message: error.message,
              },
            }
          : {
              ok: false,
              error: {
                code: "internal",
                message: "Ce serveur n'a pas pu être ajouté.",
                fix: "Réessayez ; si cela recommence, générez la clé plutôt que de l'importer.",
              },
            };
      }
    }
  );

  ipcMain.handle("server-rename", (_e, id: string, name: string) =>
    settle(renameServer(id, name))
  );
  ipcMain.handle("server-activate", (_e, id: string) =>
    settle(activateServer(id))
  );
  ipcMain.handle("server-remove", (_e, id: string) => settle(removeServer(id)));

  ipcMain.handle(
    "server-host-key",
    async (_e, id: string): Promise<AgentResponse<HostKeyDecision>> => ({
      ok: true,
      result: await hostKey(id),
    })
  );

  ipcMain.handle(
    "server-trust-reinstalled",
    async (_e, id: string): Promise<AgentResponse<ServersConfig>> => ({
      ok: true,
      result: settle(await trustReinstalled(id)),
    })
  );

  ipcMain.handle("server-public-key", (_e, id: string): string | null =>
    publicKey(id)
  );

  /**
   * The file picker for an imported key.
   *
   * The renderer never names a path of its own: it opens this dialog, the user
   * points at a file, and only then does a path reach the main process.
   */
  ipcMain.handle("key-file-pick", async (): Promise<string | null> => {
    const picked = await dialog.showOpenDialog({
      buttonLabel: "Importer",
      defaultPath: join(app.getPath("home"), ".ssh"),
      properties: ["openFile", "showHiddenFiles"],
      title: "Choisir une clé privée",
    });

    return picked.canceled ? null : (picked.filePaths[0] ?? null);
  });
}

const DEFAULT_COLS = 100;
const DEFAULT_ROWS = 30;

function size(value: unknown, fallback: number): number {
  return typeof value === "number" && value > 1 ? Math.floor(value) : fallback;
}

/**
 * What a terminal runs is decided here, never in the renderer.
 *
 * A shell gets the app's own login command, in the folder the agent named for
 * the project. An agent tab gets the command `agent.open` answers, and nothing
 * else: the app does not know how Claude, Codex or Hermes are started on that
 * machine, and has no business guessing.
 */
function registerTerminalChannels(): void {
  ipcMain.handle("terminal-diagnostics", () => terminalDiagnostics());

  ipcMain.handle(
    "terminal-open",
    async (
      event,
      id: unknown,
      serverId: unknown,
      kind: unknown,
      project: unknown,
      cols: unknown,
      rows: unknown
    ): Promise<AgentResponse<TerminalOpened>> => {
      if (typeof id !== "string") {
        return {
          error: {
            code: "bad_request",
            fix: "Ferme cet onglet et ouvre-en un autre.",
            message: "Ce terminal n'a pas d'identifiant.",
          },
          ok: false,
        };
      }

      const decided = await terminalCommand(serverId, kind, project, {
        client: agentClient,
        declares: declaresProject,
        folder: projectFolder,
        knows: (candidate) => read().servers.some((s) => s.id === candidate),
      });

      if (!decided.ok) {
        return decided;
      }

      open(
        {
          cols: size(cols, DEFAULT_COLS),
          command: decided.result.command,
          id,
          kind: decided.result.kind,
          project: typeof project === "string" ? project : null,
          rows: size(rows, DEFAULT_ROWS),
          serverId: String(serverId),
        },
        event.sender
      );

      return { ok: true, result: { session: decided.result.session } };
    }
  );

  ipcMain.on("terminal-write", (_e, id: unknown, data: unknown) => {
    if (typeof id === "string" && typeof data === "string") {
      write(id, data);
    }
  });

  ipcMain.on(
    "terminal-resize",
    (_e, id: unknown, cols: unknown, rows: unknown) => {
      if (
        typeof id === "string" &&
        typeof cols === "number" &&
        typeof rows === "number"
      ) {
        resize(id, cols, rows);
      }
    }
  );

  ipcMain.on("terminal-close", (_e, id: unknown) => {
    if (typeof id === "string") {
      closeLogin();
      close(id);
    }
  });
}

/**
 * The provider's page, in the tab that is waiting for it.
 *
 * The renderer names a session and hands the rectangle it just measured; the
 * address is the one that session printed, held here. What comes back from the
 * round trip is typed into the terminal as if it had been pasted.
 */
function registerLoginChannels(): void {
  ipcMain.handle("login-open", (event, id: unknown, box: unknown): boolean => {
    const bounds = readBounds(box);
    const address = typeof id === "string" ? pendingLogin(id) : null;

    if (!(window && bounds && address && typeof id === "string")) {
      return false;
    }

    openLogin({
      bounds,
      onClosed: (terminalId) => {
        forgetLogin(terminalId);

        if (!event.sender.isDestroyed()) {
          event.sender.send("login-closed", terminalId);
        }
      },
      onCode: (terminalId, code) => write(terminalId, `${code}\r`),
      terminalId: id,
      url: address.url,
      window,
    });

    return true;
  });

  ipcMain.on("login-move", (_e, box: unknown) => {
    const bounds = readBounds(box);

    if (bounds) {
      moveLogin(bounds);
    }
  });

  ipcMain.on("login-close", () => closeLogin());
}

function registerChannels(): void {
  registerAgentChannels();
  registerInspection();
  registerCatalog();
  registerInstall();
  registerHarden();
  registerProjects();
  registerSecrets();
  registerServices();
  registerServerChannels();
  registerTerminalChannels();
  registerLoginChannels();

  ipcMain.handle("completions", (_e, serverId: unknown, path: unknown) =>
    completions(serverId, path)
  );

  ipcMain.handle("open-url", (_e, url: unknown) => {
    if (typeof url === "string" && url.startsWith("https://")) {
      shell.openExternal(url);
    }
  });
}

app.whenReady().then(() => {
  registerChannels();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  closeAll();
  forgetServiceCredentials();
  agentClient.closeAll();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
