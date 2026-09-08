import type { WebContents } from "electron";

/**
 * The events of one long call, on their way back to the caller that started it.
 *
 * The renderer opens a stream with a token of its own and listens on a channel
 * shared by every caller of that channel: without the token, two installs run
 * side by side would each draw the other's progress. A sender whose window has
 * gone is not written to — the call outlives the window that asked for it.
 */
export function relayTo<T>(
  sender: WebContents,
  token: unknown,
  channel: string,
  key: string
): (value: T) => void {
  return (value) => {
    if (typeof token === "string" && !sender.isDestroyed()) {
      sender.send(channel, { token, [key]: value });
    }
  };
}
