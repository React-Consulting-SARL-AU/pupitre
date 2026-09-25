import type { WebContents } from "electron";

/** The token keeps two parallel streams on a shared channel from drawing each other's progress. */
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
