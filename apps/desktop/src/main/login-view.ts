import type { ViewBounds } from "@shared/terminals";
import { type BrowserWindow, WebContentsView } from "electron";
import { authorizationCode } from "./terminal-links";
import { insideFrame } from "./view-bounds";

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

/** A redirection to a port of the server is read, never followed. */
export function openLogin(options: {
  window: BrowserWindow;
  terminalId: string;
  url: string;
  bounds: ViewBounds;
  onCode: (terminalId: string, code: string) => void;
  onClosed: (terminalId: string) => void;
}): void {
  closeLogin();

  // A page of the internet, treated as one: its own session, no preload, no bridge.
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
