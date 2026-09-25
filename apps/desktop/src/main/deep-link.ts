import { APP_LINK_SCHEME } from "@pupitre/shared/app-links";
import type { DeepLink } from "@shared/shell";

export const DEEP_LINK_SCHEME = APP_LINK_SCHEME;

const ID_OK = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/;

export interface DeepLinkDeps {
  knows: (serverId: string) => boolean;
  declares: (serverId: string, project: string) => boolean;
}

function segments(url: URL): string[] {
  return [url.hostname, ...url.pathname.split("/")].filter(
    (part) => part.length > 0
  );
}

function decoded(part: string): string | null {
  try {
    const value = decodeURIComponent(part);

    return ID_OK.test(value) ? value : null;
  } catch {
    return null;
  }
}

/** A link is someone else's string: its identifiers are looked up among known servers and projects, never trusted. */
export function parseDeepLink(
  raw: string,
  deps: DeepLinkDeps
): DeepLink | null {
  let url: URL;

  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (url.protocol !== `${DEEP_LINK_SCHEME}:`) {
    return null;
  }

  const [kind, first, second, ...rest] = segments(url);

  if (rest.length > 0) {
    return null;
  }

  if (kind === "server" && first && second === undefined) {
    const serverId = decoded(first);

    return serverId && deps.knows(serverId)
      ? { kind: "server", serverId }
      : null;
  }

  if (kind === "project" && first && second) {
    const serverId = decoded(first);
    const name = decoded(second);

    return serverId &&
      name &&
      deps.knows(serverId) &&
      deps.declares(serverId, name)
      ? { kind: "project", name, serverId }
      : null;
  }

  if (kind === "account" && first === "callback" && second === undefined) {
    return url.searchParams.get("device") === "approved"
      ? { kind: "account", query: { device: "approved" } }
      : { kind: "account", query: {} };
  }

  return null;
}

export function deepLinkArgument(argv: readonly string[]): string | null {
  return argv.find((arg) => arg.startsWith(`${DEEP_LINK_SCHEME}://`)) ?? null;
}
