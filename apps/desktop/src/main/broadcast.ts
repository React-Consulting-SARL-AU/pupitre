import type { WebContents } from "electron";

let target: WebContents | null = null;

export function broadcastTo(destination: WebContents | null): void {
  target = destination;
}

export function broadcast(channel: string, payload: unknown): void {
  if (target && !target.isDestroyed()) {
    target.send(channel, payload);
  }
}
