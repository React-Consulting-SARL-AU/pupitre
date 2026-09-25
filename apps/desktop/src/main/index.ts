// Before anything reads the data folder: a development build gets its own.
import "./dev-data";
import { fileURLToPath } from "node:url";
import { windowBackground } from "@shared/appearance";
import type { MenuCommand } from "@shared/shell";
import { app, BrowserWindow, Menu, nativeTheme, session } from "electron";
import { registerAccount } from "./account";
import {
  agentClient,
  registerAgentChannels,
  registerLanguage,
  registerPlatformSync,
} from "./agent";
import { registerAgentUpdate } from "./agent-update";
import { registerPreferences, watchAttention } from "./app-preferences";
import { registerAppearance } from "./appearance";
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
import { menuTemplate } from "./menu";
import { openable, ownPage, type PageRules } from "./navigation";
import { current, windowChrome } from "./platform";
import { buildKind, platformUrl } from "./platform-url";
import { registerProjects } from "./projects";
import { forgetProjects } from "./projects-run";
import { registerReenroll } from "./reenroll";
import { registerServerChannels } from "./server-channels";
import { sshPathsWritten } from "./servers";
import { forgetServiceCredentials, registerServices } from "./services";
import { registerShots } from "./shots";
import { registerSignInCancel } from "./sign-in-cancel";
import { registerSudo } from "./sudo";
import { registerTerminalChannels } from "./terminal-channels";
import { closeAll, closeFor } from "./terminals";
import { enableTrace, trace, tracesTo } from "./trace";
import { registerTransfers, shutdownTransfers } from "./transfers";
import { checkForUpdates, startUpdater } from "./updater";

let window: BrowserWindow | null = null;

/** The language the menu and the system's dialogs speak: the system's, until the page says its own. */
let language = "";

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
 * Everything the app holds open on the servers, let go. Called on every way
 * out — the last window closed, Cmd+Q, a relaunch — and harmless twice: an
 * `ssh -L` left behind would keep its local port after the app is gone.
 */
function releaseEverything(): void {
  closeAll();
  forgetServiceCredentials();
  agentClient.closeAll();
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

const failed = watchFailures({
  language: () => language || app.getLocale(),
  release: releaseEverything,
});

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
const PAGE: PageRules = {
  devUrl: DEV_URL,
  indexFile: beside("../renderer/index.html"),
};

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
}

/** Built again when the page settles on its language: the menu speaks the app's, not the system's. */
function installMenu(): void {
  const spoken = language || app.getLocale();

  Menu.setApplicationMenu(
    Menu.buildFromTemplate(
      menuTemplate(process.platform, app.isPackaged, spoken, {
        checkUpdates: checkForUpdates,
        goToProject: () => relayMenu("palette"),
        help: (link) => openHelp(link, spoken),
        newAgent: () => relayMenu("new-agent"),
        newTerminal: () => relayMenu("new-terminal"),
        preferences: () => relayMenu("preferences"),
        shortcuts: () => relayMenu("shortcuts"),
        signOut: () => relayMenu("sign-out"),
      })
    )
  );
}

nativeTheme.on("updated", () => window?.setBackgroundColor(nativeBackground()));

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
  registerShots();
  registerHelp();
  registerSignInCancel();
  registerKeyApprovals();
  registerCompletions();
  registerLinks(bringToFront);
  registerPreferences();
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

    hardenSession();
    trustPage(PAGE);
    installMenu();

    if (app.isPackaged) {
      app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME);
    }

    registerChannels();
    // Derived file: a version that changes its shape must not wait for an edit.
    sshPathsWritten();
    startUpdater();
    watchAttention({
      bringToFront,
      focused: () => window?.isFocused() ?? false,
    });
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
  .catch(failed);

app.on("before-quit", () => {
  shutdownTransfers();
});

app.on("will-quit", releaseEverything);

app.on("window-all-closed", () => {
  releaseEverything();

  if (process.platform !== "darwin") {
    app.quit();
  }
});
