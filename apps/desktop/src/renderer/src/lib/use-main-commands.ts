import type { DeepLink, MenuCommand } from "@shared/shell";
import { useEffect } from "react";
import { tabOfKind } from "../components/projects/project-tabs";
import { useNavigation } from "../stores/navigation";

export interface MainCommandHandlers {
  menu: Record<MenuCommand, () => void>;
  openSettings: (section: "account" | "appearance") => void;
  goTo: (view: "dashboard") => void;
  select: (project: string) => void;
  readAccount: () => Promise<unknown>;
  switchServer: (id: string) => Promise<void>;
  active: () => string | null;
}

export async function followLink(
  link: DeepLink,
  handlers: MainCommandHandlers
): Promise<void> {
  if (link.kind === "account") {
    await handlers.readAccount();

    // The waiting sign-in picks up a just-approved device itself; the settings would get in its way.
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
