import type { LoginAddress } from "./terminal-links";
import { loopbackRedirect } from "./terminal-links";

export interface LoginDeps {
  pending: (id: string) => LoginAddress | null;
  serverOf: (id: string) => string | null;
  openable: (url: string) => boolean;
  /** Resolves once the local port listens. */
  forward: (id: string, serverId: string, port: number) => Promise<boolean>;
  openExternal: (url: string) => void;
}

/** A click lands on one row of the screen; the address the session printed may go on past it. */
function whole(id: string, clicked: string, deps: LoginDeps): string {
  const printed = deps.pending(id);

  return printed?.url.startsWith(clicked) ? printed.url : clicked;
}

/** Providers refuse embedded browsers; a loopback redirect port is forwarded first so the return reaches the CLI. */
export async function openFromTerminal(
  id: string,
  clicked: string,
  deps: LoginDeps
): Promise<boolean> {
  const serverId = deps.serverOf(id);
  const url = whole(id, clicked, deps);

  if (!(serverId && deps.openable(url))) {
    return false;
  }

  const port = loopbackRedirect(url);

  if (port !== null) {
    await deps.forward(id, serverId, port);
  }

  deps.openExternal(url);

  return true;
}

/** The address never left the main process: the renderer names the session alone. */
export function openPendingLogin(
  id: string,
  deps: LoginDeps
): Promise<boolean> {
  const address = deps.pending(id);

  return address
    ? openFromTerminal(id, address.url, deps)
    : Promise.resolve(false);
}

const held = new Map<string, string[]>();

export function rememberForward(id: string, forwardId: string): void {
  held.set(id, [...(held.get(id) ?? []), forwardId]);
}

export function releaseForwards(
  id: string,
  close: (forwardId: string) => void
): void {
  for (const forwardId of held.get(id) ?? []) {
    close(forwardId);
  }

  held.delete(id);
}
