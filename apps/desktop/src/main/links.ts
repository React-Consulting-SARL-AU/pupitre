import type { DeepLink } from "@shared/shell";
import { app } from "electron";
import { broadcast } from "./broadcast";
import { parseDeepLink } from "./deep-link";
import { openOutside } from "./foreground";
import { handle } from "./ipc";
import { isString, shape } from "./ipc-guard";
import { openable } from "./navigation";
import { declaresProject } from "./projects-run";
import { byId } from "./servers";
import { trace } from "./trace";

// A page that has not mounted yet listens to nothing: a link arriving before it asks is held until `deep-link:pending`.

const QUERY = /[?#]/;

let pendingLink: DeepLink | null = null;
let pageListens = false;
let front: () => void = () => undefined;

/** A query is somebody else's words, and may carry a code. */
function withoutQuery(raw: string): string {
  const at = raw.search(QUERY);

  return at === -1 ? raw : raw.slice(0, at);
}

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

export function pageGone(): void {
  pageListens = false;
}

export function registerLinks(bringToFront: () => void): void {
  front = bringToFront;

  handle("open-url", shape(isString), (_e, url) => {
    if (openable(url, app.isPackaged)) {
      openOutside(url);
    }
  });

  handle("deep-link:pending", shape(), (): DeepLink | null => {
    const link = pendingLink;

    pageListens = true;
    pendingLink = null;

    return link;
  });
}
