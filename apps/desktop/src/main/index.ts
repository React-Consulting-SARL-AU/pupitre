import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentResponse } from "@shared/agent";
import { windowBackground } from "@shared/appearance";
import type {
  HostKeyDecision,
  KeyInstall,
  KeyInstallPhase,
  ServerAdded,
  ServerDraft,
  ServerReach,
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
import { account, registerAccount } from "./account";
import {
  agentClient,
  registerAgentChannels,
  registerLanguage,
  registerPlatformSync,
} from "./agent";
import { registerAgentUpdate } from "./agent-update";
import { registerAppearance } from "./appearance";
import { broadcastTo } from "./broadcast";
import { registerCatalog } from "./catalog";
import { completions } from "./completion";
import { registerConnections } from "./connections";
import { dialogText } from "./dialogs";
import { asAgentError } from "./enrollment-run";
import { registerFleet } from "./fleet";
import { registerHarden } from "./harden";
import { registerInspection } from "./inspection";
import { registerInstall } from "./install";
import { installKey } from "./key-install";
import { closeLogin, moveLogin, openLogin } from "./login-view";
import { current, windowChrome } from "./platform";
import { isLocalPlatform } from "./platform-client";
import { registerProjects } from "./projects";
import { declaresProject, forgetProjects, projectFolder } from "./projects-run";
import { reachSsh } from "./reach";
import { registerReenroll } from "./reenroll";
import { refusalOf } from "./refusal";
import { relayTo } from "./relay";
import { SetupError } from "./server-setup";
import {
  activate as activateServer,
  add as addServer,
  byId,
  hostKey,
  publicKey,
  read,
  remove as removeServer,
  rename as renameServer,
  sshHosts,
  paths as sshPaths,
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
import { enableTrace, trace, tracesTo } from "./trace";
import { startUpdater } from "./updater";
import { usageRefusal } from "./usage-guard";
import { readBounds } from "./view-bounds";

let window: BrowserWindow | null = null;

/**
 * A file shipped next to this one, named the way the running system names it.
 *
 * `new URL(...).pathname` yields `/C:/Users/...` on Windows, which no API of
 * Electron opens; `fileURLToPath` gives back the drive letter and the
 * backslashes.
 */
function beside(relative: string): string {
  return fileURLToPath(new URL(relative, import.meta.url));
}

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
 * At creation the choice is still in the renderer, which remembers it, so the
 * window opens on whatever `nativeTheme` says and the renderer corrects it over
 * `appearance:set` before the first paint.
 */
function nativeBackground(): string {
  return windowBackground(nativeTheme.shouldUseDarkColors ? "dark" : "light");
}

/**
 * A scenario run must not take the screen.
 *
 * Playwright drives the window over the debugger, not over the desktop, so the
 * app has nothing to gain from coming to the front — and whoever is working on
 * the machine has everything to lose from eighteen windows stealing the focus
 * in a row. Under the harness, macOS is told the app is an accessory: no Dock
 * icon, never the active application, and the window shown without being
 * focused. It is still drawn, so the captures are the same picture.
 */
const HARNESSED = process.env.PUPITRE_E2E === "1";

function createWindow(): void {
  window = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 940,
    minHeight: 560,
    show: false,
    ...windowChrome(current()),
    backgroundColor: nativeBackground(),
    icon: beside("../../build/icon.png"),
    webPreferences: {
      preload: beside("../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  window.on("ready-to-show", () =>
    HARNESSED ? window?.showInactive() : window?.show()
  );

  // The trace follows the window that exists now: a reopened window on macOS
  // gets the lines, and a closed one is not written to.
  tracesTo((entry) => window?.webContents.send("trace", entry));
  broadcastTo(window.webContents);
  window.on("closed", () => {
    tracesTo(null);
    broadcastTo(null);
  });

  nativeTheme.on("updated", () =>
    window?.setBackgroundColor(nativeBackground())
  );

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) {
    window.loadURL(devUrl);
  } else {
    window.loadFile(beside("../renderer/index.html"));
  }
}

function registerServerChannels(): void {
  ipcMain.handle("servers", (): ServersConfig => read());
  ipcMain.handle("ssh-hosts", (): string[] => sshHosts());

  ipcMain.handle(
    "server-reach",
    (_e, host: string, port: number): Promise<ServerReach> =>
      reachSsh(host, port)
  );
  ipcMain.handle("servers-write", (_e, config: ServersConfig) =>
    settle(writeConfig(config))
  );

  ipcMain.handle(
    "server-add",
    async (_e, draft: ServerDraft): Promise<AgentResponse<ServerAdded>> => {
      const refused = usageRefusal(() => account.guard());

      if (refused) {
        return refused;
      }

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
                message: error.message,
                phrase: error.phrase,
              },
            }
          : {
              ok: false,
              error: {
                ...refusalOf("internal", "refusal.server.added"),
              },
            };
      }
    }
  );

  ipcMain.handle("server-rename", (_e, id: unknown, name: unknown) =>
    typeof id === "string" && typeof name === "string"
      ? settle(renameServer(id, name))
      : read()
  );
  ipcMain.handle("server-activate", (_e, id: unknown) =>
    typeof id === "string" ? settle(activateServer(id)) : read()
  );
  ipcMain.handle("server-remove", (_e, id: unknown) => {
    if (typeof id !== "string") {
      return read();
    }

    agentClient.close(id);

    return settle(removeServer(id));
  });

  /**
   * The server leaves this computer and the platform in the same gesture.
   *
   * The platform first: a local removal that left the row standing would make
   * the only place still able to erase it disappear from the app.
   */
  ipcMain.handle(
    "server-forget",
    async (_e, id: unknown): Promise<AgentResponse<ServersConfig>> => {
      const server = typeof id === "string" ? byId(id) : null;

      if (!server) {
        return {
          ok: false,
          error: { ...refusalOf("bad_request", "refusal.server.unknown") },
        };
      }

      const platformId = server.grant?.id;

      if (platformId) {
        const forgotten = await account.forgetServer(platformId);

        if (!forgotten.ok) {
          return { ok: false, error: asAgentError(forgotten.error) };
        }
      }

      agentClient.close(server.id);

      return { ok: true, result: settle(removeServer(server.id)) };
    }
  );

  ipcMain.handle(
    "server-host-key",
    async (_e, id: unknown): Promise<AgentResponse<HostKeyDecision>> =>
      typeof id === "string"
        ? { ok: true, result: await hostKey(id) }
        : {
            ok: false,
            error: { ...refusalOf("bad_request", "refusal.server.unknown") },
          }
  );

  ipcMain.handle(
    "server-trust-reinstalled",
    async (_e, id: unknown): Promise<AgentResponse<ServersConfig>> =>
      typeof id === "string"
        ? { ok: true, result: settle(await trustReinstalled(id)) }
        : {
            ok: false,
            error: { ...refusalOf("bad_request", "refusal.server.unknown") },
          }
  );

  ipcMain.handle("server-public-key", (_e, id: unknown): string | null =>
    typeof id === "string" ? publicKey(id) : null
  );

  /**
   * Installing the app's own key on the server, rather than dictating a line.
   *
   * The password crosses the bridge once, on its way in, and is held nowhere:
   * `installKey` hands it to one `ssh` through its askpass helper and forgets
   * it. The public half is read here rather than sent by the renderer, which
   * never had to carry it.
   */
  ipcMain.handle(
    "server-key-install",
    async (
      event,
      token: unknown,
      id: unknown,
      password: unknown
    ): Promise<AgentResponse<KeyInstall>> => {
      const server = typeof id === "string" ? byId(id) : null;

      if (!server) {
        return {
          ok: false,
          error: { ...refusalOf("bad_request", "refusal.server.unknown") },
        };
      }

      const half = publicKey(server.id);

      if (!half) {
        return {
          ok: false,
          error: { ...refusalOf("bad_request", "refusal.key.unreadable") },
        };
      }

      return await installKey({
        onPhase: relayTo<KeyInstallPhase>(
          event.sender,
          token,
          "server-key-install:phase",
          "phase"
        ),
        password: typeof password === "string" ? password : null,
        paths: sshPaths(),
        publicKey: half,
        server,
      });
    }
  );

  /**
   * The file picker for an imported key.
   *
   * The renderer never names a path of its own: it opens this dialog, the user
   * points at a file, and only then does a path reach the main process.
   */
  ipcMain.handle("key-file-pick", async (): Promise<string | null> => {
    const picked = await dialog.showOpenDialog({
      buttonLabel: dialogText("import"),
      defaultPath: join(app.getPath("home"), ".ssh"),
      properties: ["openFile", "showHiddenFiles"],
      title: dialogText("pickKey"),
    });

    return picked.canceled ? null : (picked.filePaths[0] ?? null);
  });
}

const DEFAULT_COLS = 100;
const DEFAULT_ROWS = 30;

function size(value: unknown, fallback: number): number {
  return typeof value === "number" && value > 1 ? Math.floor(value) : fallback;
}

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
            ...refusalOf("bad_request", "refusal.terminal.unknown"),
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

/** The renderer names a session and a rectangle; the address is the one it printed. */
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

/**
 * A development build also opens the console running beside it, which speaks
 * plain HTTP on this computer. Everywhere else the browser only ever leaves for
 * an https address.
 */
function openable(url: string): boolean {
  if (url.startsWith("https://")) {
    return true;
  }

  return !app.isPackaged && url.startsWith("http://") && isLocalPlatform(url);
}

function registerChannels(): void {
  registerAccount();
  registerAgentChannels();
  registerAgentUpdate();
  registerAppearance(() => window);
  registerFleet(settle);
  registerInspection();
  registerCatalog();
  registerInstall();
  registerReenroll();
  registerHarden();
  registerLanguage();
  registerProjects();
  registerConnections();
  registerPlatformSync();
  registerServices();
  registerServerChannels();
  registerTerminalChannels();
  registerLoginChannels();

  ipcMain.handle("completions", (_e, serverId: unknown, path: unknown) =>
    completions(serverId, path)
  );

  ipcMain.handle("open-url", (_e, url: unknown) => {
    if (typeof url === "string" && openable(url)) {
      shell.openExternal(url);
    }
  });
}

/**
 * What breaks outside a call still says what broke, and what to do about it.
 *
 * The trace is off in a packaged build, so the line also goes out on the
 * process's own error output: a start that fails would otherwise be a window
 * that never opens and an app that says nothing. The app is left running — a
 * failure in one channel is not a reason to close the terminals of the others.
 */
function stumbled(event: string, failure: unknown): void {
  const reason = failure instanceof Error ? failure.message : String(failure);

  trace("app", event, { reason });
  console.error(
    `[pupitre] ${event}: ${reason}\n  Relaunch the app, and run it with PUPITRE_TRACE=1 to see what led there.`
  );
}

process.on("uncaughtException", (failure) => stumbled("uncaught", failure));
process.on("unhandledRejection", (failure) => stumbled("unhandled", failure));

app
  .whenReady()
  .then(() => {
    enableTrace(!app.isPackaged);
    trace("app", "ready", { packaged: app.isPackaged, platform: current() });

    if (HARNESSED) {
      app.setActivationPolicy?.("accessory");
    }

    registerChannels();
    startUpdater();
    createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  })
  .catch((failure: unknown) => stumbled("start-failed", failure));

app.on("window-all-closed", () => {
  closeAll();
  forgetServiceCredentials();
  agentClient.closeAll();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
