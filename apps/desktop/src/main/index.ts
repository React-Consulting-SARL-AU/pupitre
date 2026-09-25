// Before anything reads the data folder: a development build gets its own.
import "./dev-data";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentResponse } from "@shared/agent";
import { windowBackground } from "@shared/appearance";
import type {
  HostKeyDecision,
  KeyInstall,
  KeyInstallPhase,
  ServerAdded,
  ServerChanges,
  ServerDraft,
  ServerKnock,
  ServerReach,
  ServersConfig,
  ServerUpdated,
} from "@shared/servers";
import { movesConnection } from "@shared/servers";
import type { DeepLink, MenuCommand } from "@shared/shell";
import type { SshShareState } from "@shared/ssh-names";
import type { StartupState } from "@shared/startup";
import type { TerminalOpened } from "@shared/terminals";
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  Notification,
  nativeTheme,
  session,
} from "electron";
import { account, registerAccount } from "./account";
import {
  agentClient,
  currentLanguage,
  registerAgentChannels,
  registerLanguage,
  registerPlatformSync,
} from "./agent";
import { registerAgentUpdate } from "./agent-update";
import { registerAppearance } from "./appearance";
import { attentionWatcher } from "./attention";
import { registerBackups } from "./backups";
import { broadcast, broadcastTo } from "./broadcast";
import { registerCatalog } from "./catalog";
import { completions } from "./completion";
import { registerConnections } from "./connections";
import { releaseShell, reservedShell } from "./db-shell";
import { deepLinkArgument, parseDeepLink } from "./deep-link";
import { registerDevDefaults } from "./dev-defaults";
import { dialogTextIn } from "./dialogs";
import { asAgentError } from "./enrollment-run";
import { registerFleet } from "./fleet";
import { openOutside, stayBehind } from "./foreground";
import { githubRepos } from "./github";
import { registerHarden } from "./harden";
import { HARNESSED } from "./harness";
import { openHelp, registerHelp } from "./help";
import { registerInspection } from "./inspection";
import { registerInstall } from "./install";
import { registerKeyApprovals } from "./key-approvals";
import { designatedKeyFile, designateKeyFile } from "./key-files";
import { installKey } from "./key-install";
import { knock } from "./knock";
import { menuTemplate } from "./menu";
import { openable, ownPage } from "./navigation";
import { current, windowChrome } from "./platform";
import { buildKind, platformUrl } from "./platform-url";
import { awaitListening, closeForward, openForward } from "./port-forward";
import { type PreferencesStore, preferencesStore } from "./preferences";
import { registerProjects } from "./projects";
import {
  declaresProject,
  forgetProjects,
  projectFolder,
  projectPath,
} from "./projects-run";
import { registerReenroll } from "./reenroll";
import { refusalOf } from "./refusal";
import { relayTo } from "./relay";
import { addServerRun } from "./server-add-run";
import { SetupError } from "./server-setup";
import {
  activate as activateServer,
  add as addServer,
  byId,
  forgetOrphanPin,
  hostKey,
  publicKey,
  read,
  remove as removeServer,
  rename as renameServer,
  setSshShare,
  sshHosts,
  paths as sshPaths,
  sshPathsWritten,
  sshShareState,
  trustReinstalled,
  update as updateServer,
} from "./servers";
import {
  forgetServiceCredentials,
  forwardDeps,
  registerServices,
} from "./services";
import { registerShots } from "./shots";
import { registerSignInCancel } from "./sign-in-cancel";
import { forgetSudoPassword, registerSudo } from "./sudo";
import {
  type LoginDeps,
  openFromTerminal,
  openPendingLogin,
  releaseForwards,
  rememberForward,
} from "./terminal-login";
import { terminalCommand } from "./terminal-run";
import {
  close,
  closeAll,
  closeFor,
  describeSession,
  endSession,
  onStates,
  open,
  pendingLogin,
  resize,
  serverOf,
  terminalDiagnostics,
  write,
} from "./terminals";
import { enableTrace, trace, tracesTo } from "./trace";
import { registerTransfers, shutdownTransfers } from "./transfers";
import { checkForUpdates, startUpdater } from "./updater";
import { usageRefusal } from "./usage-guard";

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
 * What has to be dropped with one server: the machine it named is no longer
 * the one the app talks to — removed from the list, reached at another address
 * or another account, or reinstalled under a new host key.
 *
 * Only that server's channels, terminals, project names and credentials go: an
 * install running on another server, and the tabs open on it, are not touched
 * by what happens to this one. Activating, renaming or adding a server drops
 * nothing at all — the file is written, and every session stands.
 */
function settle(serverId: string): void {
  agentClient.close(serverId);
  forgetProjects(serverId);
  forgetServiceCredentials(serverId);
  closeFor(serverId);
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

// Said at import, not on ready: macOS has already made the app the active one
// by then, and a suite of scenarios would take the screen once per file.
stayBehind();

/**
 * One instance of the app, and one only.
 *
 * A second launch — a double click, a link handed to the app by the system —
 * hands over to the first, which comes to the front and reads what the second
 * was launched with. Under the harness every scenario is its own instance on
 * its own data folder, and none of them takes the screen.
 */
if (!(HARNESSED || app.requestSingleInstanceLock())) {
  app.quit();
}

/**
 * The link the app was opened with, kept until the page asks for it.
 *
 * A page that has not mounted yet listens to nothing: what arrives before it
 * asks is held here, and handed over on `deep-link:pending`, once.
 */
let pendingLink: DeepLink | null = null;
let pageListens = false;

function bringToFront(): void {
  if (HARNESSED || !window) {
    return;
  }

  if (window.isMinimized()) {
    window.restore();
  }

  window.show();
  window.focus();
}

function relayMenu(command: MenuCommand): void {
  bringToFront();
  broadcast("menu:command", command);
}

/**
 * A `pupitre://` link, checked against what this computer knows before it
 * becomes a navigation; an unknown one is traced and goes nowhere.
 */
function openDeepLink(raw: string): void {
  const link: DeepLink | null = parseDeepLink(raw, {
    declares: declaresProject,
    knows: (serverId) => byId(serverId) !== null,
  });

  if (!link) {
    trace("app", "deep-link-refused", { url: raw });

    return;
  }

  trace("app", "deep-link", { kind: link.kind });
  bringToFront();

  if (pageListens) {
    broadcast("deep-link", link);
  } else {
    pendingLink = link;
  }
}

app.on("second-instance", (_event, argv) => {
  const link = deepLinkArgument(argv);

  bringToFront();

  if (link) {
    openDeepLink(link);
  }
});

app.on("open-url", (event, url) => {
  event.preventDefault();
  openDeepLink(url);
});

const DEV_URL = process.env.ELECTRON_RENDERER_URL;

/**
 * The renderer is a page the app ships, and stays one.
 *
 * It never navigates: a link it carries goes to the system browser through
 * `openable`, or nowhere. The sandbox keeps the preload to what the bridge
 * needs, and no permission — camera, notifications, geolocation — is granted
 * to a page that never asks for one on purpose.
 */
function pageRules(): { devUrl: string | undefined; indexFile: string } {
  return { devUrl: DEV_URL, indexFile: beside("../renderer/index.html") };
}

function hardenSession(): void {
  session.defaultSession.setPermissionRequestHandler((_c, _p, callback) =>
    callback(false)
  );
  session.defaultSession.setPermissionCheckHandler(() => false);
}

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
      devTools: !app.isPackaged,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Under the harness the window is never shown at all. Playwright reaches the
  // page over the debugger, which draws and captures a window nobody displays;
  // showing it — even without the focus — would drop it over whatever the
  // person at this machine is doing, once per scenario file.
  window.on("ready-to-show", () => {
    if (!HARNESSED) {
      window?.show();
    }
  });

  // The trace follows the window that exists now: a reopened window on macOS
  // gets the lines, and a closed one is not written to.
  tracesTo((entry) => window?.webContents.send("trace", entry));
  broadcastTo(window.webContents);
  window.on("closed", () => {
    tracesTo(null);
    broadcastTo(null);
  });

  const rules = pageRules();

  window.webContents.on("will-navigate", (event, url) => {
    if (!ownPage(url, rules)) {
      trace("app", "navigation-refused", { url });
      event.preventDefault();
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (openable(url, app.isPackaged)) {
      openOutside(url);
    }

    return { action: "deny" };
  });

  window.on("closed", () => {
    pageListens = false;
  });

  if (DEV_URL) {
    window.loadURL(DEV_URL);
  } else {
    window.loadFile(rules.indexFile);
  }
}

let preferences: PreferencesStore | null = null;

/** Read once the data folder is settled, which is after the command line is. */
function preferencesOf(): PreferencesStore {
  preferences ??= preferencesStore(
    join(app.getPath("userData"), "preferences.json")
  );

  return preferences;
}

const STARTUP_PLATFORMS: NodeJS.Platform[] = ["darwin", "win32"];

function startupState(): StartupState {
  return {
    enabled: preferencesOf().read().launchAtLogin,
    supported: STARTUP_PLATFORMS.includes(process.platform),
  };
}

/**
 * The file is the wish, the system's list of login items is where it lands.
 * Under the harness nothing is registered: a suite is a dozen launches, and
 * none of them should leave the test app in the reader's login items.
 */
function setStartup(enabled: boolean): StartupState {
  preferencesOf().set({ launchAtLogin: enabled });

  if (!HARNESSED && STARTUP_PLATFORMS.includes(process.platform)) {
    app.setLoginItemSettings({ openAtLogin: enabled });
  }

  return startupState();
}

function registerPreferences(): void {
  ipcMain.handle(
    "notifications:enabled",
    () => preferencesOf().read().notifications
  );
  ipcMain.handle(
    "notifications:set",
    (_e, enabled: unknown) =>
      preferencesOf().set({ notifications: enabled === true }).notifications
  );
  ipcMain.handle("startup:state", () => startupState());
  ipcMain.handle("startup:set", (_e, enabled: unknown) =>
    setStartup(enabled === true)
  );
}

function paintBadge(count: number): void {
  if (process.platform === "darwin") {
    app.dock?.setBadge(count > 0 ? String(count) : "");
  } else {
    app.setBadgeCount(count);
  }
}

/**
 * A session that starts waiting while the reader is elsewhere says so once,
 * outside the window. The Dock counts the ones still waiting. Neither happens
 * under the harness, where nothing may reach the screen.
 */
function watchAttention(): void {
  if (HARNESSED) {
    return;
  }

  onStates(
    attentionWatcher({
      allowed: () => preferencesOf().read().notifications,
      badge: paintBadge,
      focused: () => window?.isFocused() ?? false,
      notify: (id) => {
        const session = describeSession(id);

        if (!(session && Notification.isSupported())) {
          return;
        }

        const language = currentLanguage();
        const notice = new Notification({
          body: dialogTextIn(language, "attentionBody", {
            title: [session.kind, session.project].filter(Boolean).join(" · "),
          }),
          title: dialogTextIn(language, "attentionTitle"),
        });

        notice.on("click", () => {
          bringToFront();
          broadcast("terminal-wanted", { id });
        });
        notice.show();
      },
    })
  );
}

nativeTheme.on("updated", () => window?.setBackgroundColor(nativeBackground()));

function registerServerChannels(): void {
  ipcMain.handle("servers", (): ServersConfig => read());
  ipcMain.handle("ssh-hosts", (): string[] => sshHosts());
  ipcMain.handle("ssh-share:state", (): SshShareState => sshShareState());
  ipcMain.handle(
    "ssh-share:set",
    (_e, shared: unknown): SshShareState => setSshShare(shared === true)
  );

  ipcMain.handle(
    "server-reach",
    (_e, target: ServerKnock): Promise<ServerReach> =>
      knock(target, sshPathsWritten(), {
        forgetStalePin: () => forgetOrphanPin(target),
      })
  );

  /**
   * The password, when the knock asked for one, crosses here with the draft
   * and goes straight to one `ssh`: the server is added and opened in the same
   * gesture, or not added at all when the machine refuses it.
   */
  ipcMain.handle(
    "server-add",
    (_e, draft: ServerDraft): Promise<AgentResponse<ServerAdded>> => {
      const refused = usageRefusal(() => account.guard());

      if (refused) {
        return Promise.resolve(refused);
      }

      if (draft.key.mode === "import" && !designatedKeyFile(draft.key.file)) {
        return Promise.resolve({
          ok: false,
          error: refusalOf("bad_request", "refusal.key.missing", {
            source: String(draft.key.file),
          }),
        });
      }

      return addServerRun(draft, {
        add: addServer,
        config: read,
        install: (server, half, password) =>
          installKey({
            freshKey: true,
            password,
            paths: sshPaths(),
            publicKey: half,
            server,
          }),
        remove: (id) => removeServer(id).then(() => undefined),
      });
    }
  );

  ipcMain.handle("server-rename", (_e, id: unknown, name: unknown) =>
    typeof id === "string" && typeof name === "string"
      ? renameServer(id, name)
      : read()
  );
  ipcMain.handle("server-activate", (_e, id: unknown) =>
    typeof id === "string" ? activateServer(id) : read()
  );

  /**
   * The address, the port, the account or the SSH name of a server, as the
   * reader typed them. Each is checked here before it becomes a line of the
   * SSH file; the channels are dropped when the address, the port or the
   * account moved, since the ones open reach the old one. The SSH name is
   * other clients' word for the server — the app's own sessions ride the
   * identifier and stand.
   */
  ipcMain.handle(
    "server-update",
    async (
      _e,
      id: unknown,
      changes: unknown
    ): Promise<AgentResponse<ServerUpdated>> => {
      if (typeof id !== "string" || !byId(id)) {
        return {
          ok: false,
          error: { ...refusalOf("bad_request", "refusal.server.unknown") },
        };
      }

      try {
        const asked = serverChanges(changes);
        const updated = await updateServer(id, asked);

        if (movesConnection(asked)) {
          settle(id);
        }

        return { ok: true, result: updated };
      } catch (failure) {
        if (failure instanceof SetupError) {
          return {
            ok: false,
            error: {
              code: "bad_request",
              message: failure.message,
              phrase: failure.phrase,
            },
          };
        }

        throw failure;
      }
    }
  );
  ipcMain.handle("server-remove", async (_e, id: unknown) => {
    if (typeof id !== "string") {
      return read();
    }

    settle(id);
    forgetSudoPassword(id);

    return await removeServer(id);
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

      settle(server.id);
      forgetSudoPassword(server.id);

      return { ok: true, result: await removeServer(server.id) };
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

  /**
   * A new host key is a new machine: what was open on the old one — sessions,
   * the names it declared, its credentials — says nothing about this one, and
   * the next contact pins what answers.
   */
  ipcMain.handle(
    "server-trust-reinstalled",
    async (_e, id: unknown): Promise<AgentResponse<ServersConfig>> => {
      if (typeof id !== "string") {
        return {
          ok: false,
          error: { ...refusalOf("bad_request", "refusal.server.unknown") },
        };
      }

      settle(id);
      forgetSudoPassword(id);

      return { ok: true, result: await trustReinstalled(id) };
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
      buttonLabel: dialogTextIn(currentLanguage(), "import"),
      defaultPath: join(app.getPath("home"), ".ssh"),
      properties: ["openFile", "showHiddenFiles"],
      title: dialogTextIn(currentLanguage(), "pickKey"),
    });

    return picked.canceled ? null : designateKeyFile(picked.filePaths[0]);
  });
}

/** What the renderer may change on a server, read field by field and nothing else. */
function serverChanges(value: unknown): ServerChanges {
  const held = (value ?? {}) as Record<string, unknown>;

  return {
    ...(typeof held.host === "string" ? { host: held.host } : {}),
    ...(typeof held.port === "number" ? { port: held.port } : {}),
    ...(typeof held.user === "string" ? { user: held.user } : {}),
    ...(typeof held.slug === "string" ? { slug: held.slug } : {}),
  };
}

const DEFAULT_COLS = 100;
const DEFAULT_ROWS = 30;

/**
 * The root of the server's files, as the agent's own completions name it: the
 * folder above the projects root. It is what a folder of the server view
 * counts from, and it is never a string the renderer chose.
 */
async function workRoot(serverId: string): Promise<string | null> {
  const named = await completions(serverId, "");

  if (!named.ok) {
    return null;
  }

  const at = named.result.root.lastIndexOf("/");

  return at > 0 ? named.result.root.slice(0, at) : null;
}

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
      session: unknown,
      cols: unknown,
      rows: unknown,
      dir: unknown
    ): Promise<AgentResponse<TerminalOpened>> => {
      if (typeof id !== "string") {
        return {
          error: {
            ...refusalOf("bad_request", "refusal.terminal.unknown"),
          },
          ok: false,
        };
      }

      // A tab the Services screen asked for runs the command the agent gave
      // for that database, held here under the tab's identifier: what the
      // renderer names for it is read no further.
      const held = reservedShell(id, serverId);
      const decided = held
        ? { ok: true as const, result: held }
        : await terminalCommand(
            { dir, id, kind, project, serverId, session },
            {
              client: agentClient,
              declares: declaresProject,
              folder: projectFolder,
              knows: (candidate) =>
                read().servers.some((s) => s.id === candidate),
              path: projectPath,
              root: workRoot,
            }
          );

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

  ipcMain.on("terminal-copy", (_e, text: unknown) => {
    if (typeof text === "string" && text.length > 0) {
      clipboard.writeText(text);
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

  ipcMain.on("terminal-close", (_e, id: unknown, end: unknown) => {
    if (typeof id === "string") {
      releaseForwards(id, closeForward);
      releaseShell(id);
      close(id);
      endSession(end);
    }
  });
}

/**
 * A sign-in that comes back to a port of the machine is carried here on the
 * same port, and held for as long as the session that asked for it.
 */
async function forwardLogin(
  id: string,
  serverId: string,
  port: number
): Promise<boolean> {
  const answer = await openForward(serverId, port, "login", forwardDeps, {
    localPort: port,
  });

  if (!answer.ok) {
    trace("login", `port ${port}: ${answer.error.message}`);

    return false;
  }

  rememberForward(id, answer.result.id);

  return awaitListening(port);
}

const loginDeps: LoginDeps = {
  forward: forwardLogin,
  openExternal: openOutside,
  openable: (url) => openable(url, app.isPackaged),
  pending: pendingLogin,
  serverOf,
};

/** The renderer names a session; the address it opens is the one that session printed. */
function registerLoginChannels(): void {
  ipcMain.handle(
    "login-open",
    (_e, id: unknown): Promise<boolean> =>
      typeof id === "string"
        ? openPendingLogin(id, loginDeps)
        : Promise.resolve(false)
  );

  ipcMain.handle(
    "terminal-open-url",
    (_e, id: unknown, url: unknown): Promise<boolean> =>
      typeof id === "string" && typeof url === "string"
        ? openFromTerminal(id, url, loginDeps)
        : Promise.resolve(false)
  );
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
  registerSudo();
  registerLanguage();
  registerProjects({ root: workRoot });
  registerConnections();
  registerBackups();

  ipcMain.handle("github:repos", (_event, refresh: unknown) =>
    githubRepos(refresh === true)
  );
  registerDevDefaults();
  registerPlatformSync();
  registerServices();
  registerServerChannels();
  registerTerminalChannels();
  registerLoginChannels();
  registerTransfers({ root: workRoot });
  registerShots();
  registerHelp();
  registerSignInCancel();
  registerKeyApprovals();

  ipcMain.handle("completions", (_e, serverId: unknown, path: unknown) =>
    completions(serverId, path)
  );

  ipcMain.handle("open-url", (_e, url: unknown) => {
    if (typeof url === "string" && openable(url, app.isPackaged)) {
      openOutside(url);
    }
  });

  ipcMain.handle("deep-link:pending", (): DeepLink | null => {
    const link = pendingLink;

    pageListens = true;
    pendingLink = null;

    return link;
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
    trace("app", "ready", {
      build: buildKind(),
      console: platformUrl(),
      packaged: app.isPackaged,
      platform: current(),
    });

    hardenSession();
    Menu.setApplicationMenu(
      Menu.buildFromTemplate(
        menuTemplate(process.platform, app.isPackaged, app.getLocale(), {
          checkUpdates: checkForUpdates,
          goToProject: () => relayMenu("palette"),
          help: (link) => openHelp(link, app.getLocale()),
          newAgent: () => relayMenu("new-agent"),
          newTerminal: () => relayMenu("new-terminal"),
          preferences: () => relayMenu("preferences"),
          shortcuts: () => relayMenu("shortcuts"),
          signOut: () => relayMenu("sign-out"),
        })
      )
    );

    if (app.isPackaged) {
      app.setAsDefaultProtocolClient("pupitre");
    }

    registerChannels();
    registerPreferences();
    // Derived file: a version that changes its shape must not wait for an edit.
    sshPathsWritten();
    startUpdater();
    watchAttention();
    createWindow();

    const opened = deepLinkArgument(process.argv);

    if (opened) {
      openDeepLink(opened);
    }
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  })
  .catch((failure: unknown) => stumbled("start-failed", failure));

app.on("before-quit", () => {
  shutdownTransfers();
});

app.on("window-all-closed", () => {
  closeAll();
  forgetServiceCredentials();
  agentClient.closeAll();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
