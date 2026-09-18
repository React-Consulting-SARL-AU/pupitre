import type { DeepLink, MenuCommand } from "@shared/shell";
import { useEffect } from "react";
import { tabOfKind } from "../components/projects/project-tabs";
import { useNavigation } from "../stores/navigation";

/**
 * What the main process asks the window to do, outside of any call.
 *
 * A menu item, a `pupitre://` link and a clicked notification all end as a
 * gesture the reader could have made here. The hook listens for the three and
 * hands each to the shell, which performs it the way it performs a click —
 * the sign-out through its own question, a project through its selection.
 */
export interface MainCommandHandlers {
  /** One gesture per menu item the main process relays. */
  menu: Record<MenuCommand, () => void>;
  /** The settings, opened on the section a link or a menu item names. */
  openSettings: (section: "account" | "appearance") => void;
  goTo: (view: "dashboard") => void;
  select: (project: string) => void;
  /** Reads the account again: the platform just answered a callback. */
  readAccount: () => Promise<unknown>;
  /** Drives another server; the one in front is `active`. */
  switchServer: (id: string) => Promise<void>;
  active: () => string | null;
}

/** A checked link, performed as the clicks it stands for. */
export async function followLink(
  link: DeepLink,
  handlers: MainCommandHandlers
): Promise<void> {
  if (link.kind === "account") {
    await handlers.readAccount();

    // A device the console just confirmed: the sign-in that waits picks the
    // account up by itself, and the settings would only get in its way.
    if (link.query.device !== "approved") {
      handlers.openSettings("account");
    }

    return;
  }

  if (link.serverId !== handlers.active()) {
    await handlers.switchServer(link.serverId);
  }

  if (link.kind === "project") {
    handlers.select(link.name);
  } else {
    handlers.goTo("dashboard");
  }
}

export function useMainCommands(handlers: MainCommandHandlers): void {
  useEffect(() => {
    const onLink = (link: DeepLink) => followLink(link, handlers);
    const menu = window.pupitre.onMenuCommand((command) =>
      handlers.menu[command]()
    );
    const link = window.pupitre.onDeepLink(onLink);
    const wanted = window.pupitre.onTerminalWanted((id) => {
      const navigation = useNavigation.getState();
      const tab = navigation.terminals.find((one) => one.id === id);

      if (tab?.project) {
        navigation.select(tab.project);
        navigation.setProjectTab(tab.project, tabOfKind(tab.kind));
      }

      navigation.activateTerminal(id);
    });

    window.pupitre.pendingDeepLink().then((target) => {
      if (target) {
        onLink(target);
      }
    });

    return () => {
      menu();
      link();
      wanted();
    };
  }, [handlers]);
}
