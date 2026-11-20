import type { PortForward } from "@shared/services";
import type { MenuItemConstructorOptions } from "electron";
import { dialogTextIn } from "./dialogs";

/** Asks for a windowless start; the login item passes it on Windows, where no system call tells a login launch apart. */
export const BACKGROUND_ARGUMENT = "--background";

export interface BackgroundNeeds {
  agentsListening: boolean;
  keptForwards: number;
}

export interface BackgroundLaunch {
  platform: NodeJS.Platform;
  argv: readonly string[];
  wasOpenedAtLogin: boolean;
}

export interface TrayActions {
  open: () => void;
  quit: () => void;
}

export interface TrayState {
  agentsListening: boolean;
  forwards: readonly PortForward[];
  serverName: (serverId: string) => string;
}

export function backgroundNeeded(needs: BackgroundNeeds): boolean {
  return needs.agentsListening || needs.keptForwards > 0;
}

/** A macOS login item carries no argument: the system says whether it opened the app. */
function asksForBackground(launch: BackgroundLaunch): boolean {
  return (
    launch.argv.includes(BACKGROUND_ARGUMENT) ||
    (launch.platform === "darwin" && launch.wasOpenedAtLogin)
  );
}

/** A launch that asks for the background with nothing to hold opens the window, as it always did. */
export function startsInBackground(
  launch: BackgroundLaunch,
  needs: BackgroundNeeds
): boolean {
  return asksForBackground(launch) && backgroundNeeded(needs);
}

function forwardLine(
  locale: string,
  forward: PortForward,
  serverName: (serverId: string) => string
): MenuItemConstructorOptions {
  return {
    enabled: false,
    id: `forward-${forward.id}`,
    label: dialogTextIn(
      locale,
      forward.reconnecting ? "trayForwardDown" : "trayForward",
      {
        label: forward.label,
        port: String(forward.localPort),
        server: serverName(forward.serverId),
      }
    ),
  };
}

export function trayTemplate(
  locale: string,
  state: TrayState,
  actions: TrayActions
): MenuItemConstructorOptions[] {
  const held: MenuItemConstructorOptions[] = [
    ...(state.agentsListening
      ? [
          {
            enabled: false,
            id: "agents",
            label: dialogTextIn(locale, "trayAgents"),
          },
        ]
      : []),
    ...state.forwards.map((forward) =>
      forwardLine(locale, forward, state.serverName)
    ),
  ];

  return [
    {
      click: actions.open,
      id: "open",
      label: dialogTextIn(locale, "trayOpen"),
    },
    { type: "separator" },
    ...held,
    ...(held.length > 0 ? [{ type: "separator" as const }] : []),
    {
      click: actions.quit,
      id: "quit",
      label: dialogTextIn(locale, "quit"),
    },
  ];
}
