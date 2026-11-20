// Must run before anything reads the data folder: a development build gets its own.
import "./dev-data";
import { fileURLToPath } from "node:url";
import { windowBackground } from "@shared/appearance";
import type { MenuCommand } from "@shared/shell";
import {
  app,
  BrowserWindow,
  Menu,
  nativeTheme,
  powerMonitor,
  session,
} from "electron";
import { registerAccess } from "./access";
import { registerAccount } from "./account";
import {
  agentClient,
  registerAgentChannels,
  registerLanguage,
  registerPlatformSync,
  restChannels,
} from "./agent";
import { registerAgentUpdate } from "./agent-update";
import { registerPreferences, watchAttention } from "./app-preferences";
import { registerAppearance } from "./appearance";
import { backgroundNeeds, hideTray, showTray } from "./background";
import { backgroundNeeded, startsInBackground } from "./background-run";
import { registerBackups } from "./backups";
import { broadcast, broadcastTo } from "./broadcast";
import { registerCatalog } from "./catalog";
import { registerCompletions, workRoot } from "./completion";
import { registerConnections } from "./connections";
import { DEEP_LINK_SCHEME, deepLinkArgument } from "./deep-link";
import { registerDevDefaults } from "./dev-defaults";
import { watchFailures } from "./failures";
import { registerFleet } from "./fleet";
import { openOutside, stayBehind } from "./foreground";
import { registerHarden } from "./harden";
import { HARNESSED } from "./harness";
import { openHelp, registerHelp } from "./help";
import { registerInspection } from "./inspection";
import { registerInstall } from "./install";
import { trustPage } from "./ipc-guard";
import { registerKeyApprovals } from "./key-approvals";
import { openDeepLink, pageGone, registerLinks } from "./links";
import { closeLocalAgents, registerLocalAgents } from "./mcp";
import { menuTemplate } from "./menu";
import { openable, ownPage, type PageRules } from "./navigation";
import { current, windowChrome } from "./platform";
import { buildKind, platformUrl } from "./platform-url";
import { reviveKeptForwards } from "./port-forward";
import { registerProjects } from "./projects";
import { forgetProjects } from "./projects-run";
import { registerReenroll } from "./reenroll";
import { registerServerChannels } from "./server-channels";
import { sshPathsWritten } from "./servers";
import {
  forgetServiceCredentials,
  forgetServiceSecrets,
  registerServices,
  reopenKept,
} from "./services";
import { registerSignInCancel } from "./sign-in-cancel";
import { registerSudo } from "./sudo";
import { registerTerminalChannels } from "./terminal-channels";
import { closeAll, closeFor } from "./terminals";
import { enableTrace, trace, tracesTo } from "./trace";
import { registerTransfers, shutdownTransfers } from "./transfers";
import { checkForUpdates, startUpdater } from "./updater";

let window: BrowserWindow | null = null;

/** The system's language until the page settles on its own. */
let language = "";

/** `new URL(...).pathname` yields `/C:/Users/...` on Windows, which no Electron API opens. */
function beside(relative: string): string {
  return fileURLToPath(new URL(relative, import.meta.url));
}

/** Drops only this server's sessions: installs and tabs on other servers are left standing. */
function settle(serverId: string): void {
  agentClient.close(serverId);
  forgetProjects(serverId);
  forgetServiceCredentials(serverId);
  closeFor(serverId);
}

/** What only the window used; the forwards and the agents' socket outlive it in the background. */
function releaseWindow(): void {
  closeAll();
  forgetServiceSecrets();
  agentClient.closeAll();
}

/** Runs on every way out and is harmless twice: a leftover `ssh -L` would keep its local port. */
function releaseEverything(): void {
  releaseWindow();
  forgetServiceCredentials();
  closeLocalAgents();
}

/** Never under the harness: a scenario must leave no icon in the menu bar. */
function rests(): boolean {
  return !HARNESSED && backgroundNeeded(backgroundNeeds());
}

function spokenLanguage(): string {
  return language || app.getLocale();
}

/** The renderer holds the theme choice and corrects this over `appearance:set` before the first paint. */
function nativeBackground(): string {
  return windowBackground(nativeTheme.shouldUseDarkColors ? "dark" : "light");
}

// At import, not on ready: by then macOS has already made the app active and the e2e suite would take the screen.
stayBehind();

const failed = watchFailures({
  language: () => language || app.getLocale(),
  release: releaseEverything,
});

// Under the harness every scenario is its own instance on its own data folder.
if (!(HARNESSED || app.requestSingleInstanceLock())) {
  app.quit();
}

function toBackground(): void {
  releaseWindow();
  restChannels(true);
  app.dock?.hide();
  showTray(spokenLanguage, { open: showWindow, quit: () => app.quit() });
  trace("app", "background", { ...backgroundNeeds() });
}

function showWindow(): void {
  if (window) {
    bringToFront();

    return;
  }

  restChannels(false);
  hideTray();
  app.dock?.show().catch(failed);
  createWindow();
}

/** Cmd+Q sends the app to the background while something there still needs it; the menu bar icon quits for good. */
function quitOrRest(): void {
  if (window && rests()) {
    window.close();

    return;
  }

  app.quit();
}

function bringToFront(): void {
  if (HARNESSED) {
    return;
  }

  if (!window) {
    showWindow();

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

const PAGE: PageRules = {
  devUrl: DEV_URL,
  indexFile: beside("../renderer/index.html"),
};

/** Called with each window, never at start: touching the default session starts a renderer process. */
function hardenSession(): void {
  session.defaultSession.setPermissionRequestHandler((_c, _p, callback) =>
    callback(false)
  );
  session.defaultSession.setPermissionCheckHandler(() => false);
}

function createWindow(): void {
  hardenSession();
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

  // Playwright captures over the debugger; showing the window would drop it over the user's work per scenario.
  window.on("ready-to-show", () => {
    if (!HARNESSED) {
      window?.show();
    }
  });

  tracesTo((entry) => window?.webContents.send("trace", entry));
  broadcastTo(window.webContents);
  window.on("closed", () => {
    window = null;
    tracesTo(null);
    broadcastTo(null);
    pageGone();
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (!ownPage(url, PAGE)) {
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

  if (DEV_URL) {
    window.loadURL(DEV_URL);
  } else {
    window.loadFile(PAGE.indexFile);
  }

  // The window's closing released every forward: the kept ones come back with it.
  reopenKept().catch(failed);
}

function installMenu(): void {
  const spoken = spokenLanguage();

  Menu.setApplicationMenu(
    Menu.buildFromTemplate(
      menuTemplate(process.platform, app.isPackaged, spoken, {
        checkUpdates: checkForUpdates,
        goToProject: () => relayMenu("palette"),
        help: (link) => openHelp(link, spoken),
        newAgent: () => relayMenu("new-agent"),
        newTerminal: () => relayMenu("new-terminal"),
        preferences: () => relayMenu("preferences"),
        quit: quitOrRest,
        shortcuts: () => relayMenu("shortcuts"),
        signOut: () => relayMenu("sign-out"),
      })
    )
  );
}

nativeTheme.on("updated", () => window?.setBackgroundColor(nativeBackground()));

function registerChannels(): void {
  registerAccess();
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
  registerLanguage((spoken) => {
    language = spoken;
    installMenu();
  });
  registerProjects({ root: workRoot });
  registerConnections();
  registerBackups();
  registerDevDefaults();
  registerPlatformSync();
  registerServices();
  registerServerChannels(settle);
  registerTerminalChannels();
  registerTransfers({ root: workRoot });
  registerHelp();
  registerSignInCancel();
  registerKeyApprovals();
  registerCompletions();
  registerLinks(bringToFront);
  registerPreferences();
  registerLocalAgents();
}

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

    trustPage(PAGE);
    installMenu();

    if (app.isPackaged) {
      app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME);
    }

    registerChannels();
    // Rewritten at every start so a version that changes this derived file's shape need not wait for an edit.
    sshPathsWritten();
    startUpdater();
    watchAttention({
      bringToFront,
      focused: () => window?.isFocused() ?? false,
    });
    powerMonitor.on("resume", reviveKeptForwards);

    const launch = {
      argv: process.argv,
      platform: process.platform,
      wasOpenedAtLogin: app.getLoginItemSettings().wasOpenedAtLogin === true,
    };

    if (!HARNESSED && startsInBackground(launch, backgroundNeeds())) {
      reopenKept().catch(failed);
      toBackground();
    } else {
      createWindow();
    }

    const opened = deepLinkArgument(process.argv);

    if (opened) {
      openDeepLink(opened);
    }

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        showWindow();
      }
    });
  })
  .catch(failed);

app.on("before-quit", () => {
  shutdownTransfers();
});

app.on("will-quit", releaseEverything);

app.on("window-all-closed", () => {
  if (rests()) {
    toBackground();

    return;
  }

  releaseEverything();

  if (process.platform !== "darwin") {
    app.quit();
  }
});
