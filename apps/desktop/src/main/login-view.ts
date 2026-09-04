import type { ViewBounds } from "@shared/terminals";
import { type BrowserWindow, WebContentsView } from "electron";
import { authorizationCode } from "./terminal-links";
import { insideFrame } from "./view-bounds";

/**
 * The provider's page, inside the tab that asked for it.
 *
 * Signing an agent in used to mean leaving the app: the address opened in the
 * system browser, and the code came back by hand. It is a view of the window
 * here, laid over the terminal, and the app reads the code off the address the
 * provider redirects to — the round trip never leaves the tab.
 *
 * The view is a page of the internet and is treated as one: its own session, no
 * preload, no integration, and nothing of the app reachable from it.
 */

interface Live {
  view: WebContentsView;
  window: BrowserWindow;
  terminalId: string;
}

let live: Live | null = null;

function clamp(bounds: ViewBounds, window: BrowserWindow): ViewBounds {
  return insideFrame(bounds, window.getContentBounds());
}

export function closeLogin(): void {
  if (!live) {
    return;
  }

  const { view, window } = live;

  live = null;
  window.contentView.removeChildView(view);
  view.webContents.close();
}

/**
 * Opens the address the terminal is waiting on, and watches where it goes.
 *
 * Every step of the round trip is examined rather than followed blindly: the
 * moment one carries a code, it is handed to the session that asked and the
 * view closes. A provider that redirects to a port of the server — unreachable
 * from this computer — is answered before the page is even fetched.
 */
export function openLogin(options: {
  window: BrowserWindow;
  terminalId: string;
  url: string;
  bounds: ViewBounds;
  onCode: (terminalId: string, code: string) => void;
  onClosed: (terminalId: string) => void;
}): void {
  closeLogin();

  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      partition: "persist:pupitre-login",
      sandbox: true,
    },
  });

  live = { terminalId: options.terminalId, view, window: options.window };

  const finish = (code: string | null): void => {
    closeLogin();

    if (code) {
      options.onCode(options.terminalId, code);
    }

    options.onClosed(options.terminalId);
  };

  const inspect = (event: { preventDefault: () => void }, url: string) => {
    const code = authorizationCode(url);

    if (code) {
      event.preventDefault();
      finish(code);
    }
  };

  view.webContents.on("will-navigate", inspect);
  view.webContents.on("will-redirect", inspect);
  view.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  options.window.contentView.addChildView(view);
  view.setBounds(clamp(options.bounds, options.window));
  view.webContents.loadURL(options.url);
}

export function moveLogin(bounds: ViewBounds): void {
  if (live) {
    live.view.setBounds(clamp(bounds, live.window));
  }
}

/** Which session the open view belongs to, or nothing when none is open. */
export function loginOwner(): string | null {
  return live?.terminalId ?? null;
}
