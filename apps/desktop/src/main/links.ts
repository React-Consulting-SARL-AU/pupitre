import type { DeepLink } from "@shared/shell";
import { app, ipcMain } from "electron";
import { broadcast } from "./broadcast";
import { parseDeepLink } from "./deep-link";
import { openOutside } from "./foreground";
import { openable } from "./navigation";
import { declaresProject } from "./projects-run";
import { byId } from "./servers";
import { trace } from "./trace";

/**
 * The links that leave the app for the browser, and the `pupitre://` links
 * that come into it.
 *
 * A page that has not mounted yet listens to nothing: a link that arrives
 * before it asks is held here, and handed over on `deep-link:pending`, once.
 */

const QUERY = /[?#]/;

let pendingLink: DeepLink | null = null;
let pageListens = false;
let front: () => void = () => undefined;

/** The address without what follows `?`: a query is somebody else's words, and may carry a code. */
function withoutQuery(raw: string): string {
  const at = raw.search(QUERY);

  return at === -1 ? raw : raw.slice(0, at);
}

/**
 * A `pupitre://` link, checked against what this computer knows before it
 * becomes a navigation; an unknown one is traced and goes nowhere.
 */
export function openDeepLink(raw: string): void {
  const link = parseDeepLink(raw, {
    declares: declaresProject,
    knows: (serverId) => byId(serverId) !== null,
  });

  if (!link) {
    trace("app", "deep-link-refused", { url: withoutQuery(raw) });

    return;
  }

  trace("app", "deep-link", { kind: link.kind });
  front();

  if (pageListens) {
    broadcast("deep-link", link);
  } else {
    pendingLink = link;
  }
}

/** The window closed: the next page asks again before it hears anything. */
export function pageGone(): void {
  pageListens = false;
}

export function registerLinks(bringToFront: () => void): void {
  front = bringToFront;

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
