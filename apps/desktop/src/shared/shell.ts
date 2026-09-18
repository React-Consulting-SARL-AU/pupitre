/**
 * What the main process tells the window to do, outside of any call.
 *
 * A menu item and a deep link both end as a gesture the reader could have made
 * in the window: the main process names it, and the window performs it the way
 * it performs a click, confirmations included.
 */

export type MenuCommand =
  | "palette"
  | "preferences"
  | "new-terminal"
  | "new-agent"
  | "shortcuts"
  | "sign-out";

export const MENU_COMMANDS: readonly MenuCommand[] = [
  "palette",
  "preferences",
  "new-terminal",
  "new-agent",
  "shortcuts",
  "sign-out",
];

/**
 * A `pupitre://` link, once the main process has checked what it names.
 *
 * A server is one of `servers.json`; a project is one the agent of that server
 * has declared; the account callback carries what the platform put in its
 * query. Nothing else becomes a navigation.
 */
export type DeepLink =
  | { kind: "server"; serverId: string }
  | { kind: "project"; serverId: string; name: string }
  | { kind: "account"; query: Record<string, string> };
