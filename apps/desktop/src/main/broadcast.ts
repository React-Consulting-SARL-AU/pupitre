import type { WebContents } from "electron";

/**
 * What the whole window is told, rather than the caller of one command.
 *
 * A channel that drops belongs to no call in particular: the install that was
 * in flight learns of it through its own refusal, and every other screen learns
 * of it here. A window that has gone is not written to.
 */

let target: WebContents | null = null;

export function broadcastTo(destination: WebContents | null): void {
  target = destination;
}

export function broadcast(channel: string, payload: unknown): void {
  if (target && !target.isDestroyed()) {
    target.send(channel, payload);
  }
}
