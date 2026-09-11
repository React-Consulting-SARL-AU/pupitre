import type { Project } from "@pupitre/shared/agent-protocol/state";
import type { DictionaryKey } from "@renderer/i18n/en";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { PaletteEntry } from "@renderer/lib/palette";
import { PROJECT_LOOK } from "@renderer/lib/project-state";
import { useNavigation, type View } from "@renderer/stores/navigation";
import type { Server } from "@shared/servers";
import type { Terminal } from "@shared/terminals";
import { useMemo } from "react";
import { CommandPalette } from "./command-palette";

/**
 * The palette filled with what this window knows.
 *
 * The views are the sidebar's, in its order; the projects and the terminals
 * are the driven server's; the servers are every one this computer knows,
 * the driven one aside. Picking one is exactly the click it stands for.
 */

const VIEWS: readonly { view: View; label: DictionaryKey }[] = [
  { label: "shell.sidebar.dashboard", view: "dashboard" },
  { label: "shell.sidebar.services", view: "services" },
  { label: "shell.sidebar.activity", view: "activity" },
  { label: "shell.sidebar.gallery", view: "shots" },
  { label: "shell.sidebar.files", view: "files" },
  { label: "shell.sidebar.settings", view: "settings" },
];

export function AppPalette({
  open,
  server,
  servers,
  projects,
  terminals,
  onClose,
  onSwitchServer,
}: {
  open: boolean;
  server: Server | null;
  servers: readonly Server[];
  projects: readonly Project[];
  terminals: readonly Terminal[];
  onClose: () => void;
  onSwitchServer: (id: string) => void;
}) {
  const t = useTranslations();

  const entries = useMemo<PaletteEntry[]>(
    () => [
      ...VIEWS.map((one) => ({
        id: one.view,
        kind: "view" as const,
        label: t(one.label),
      })),
      ...projects.map((project) => ({
        hint: t(PROJECT_LOOK[project.state].label),
        id: project.name,
        kind: "project" as const,
        label: project.name,
      })),
      ...terminals.map((terminal) => ({
        hint: terminal.project ?? t("shell.sidebar.server"),
        id: terminal.id,
        kind: "terminal" as const,
        label: terminal.title,
      })),
      ...servers
        .filter((one) => one.id !== server?.id)
        .map((one) => ({
          hint: one.host,
          id: one.id,
          kind: "server" as const,
          label: one.name,
        })),
    ],
    [t, projects, terminals, servers, server]
  );

  function pick(entry: PaletteEntry): void {
    const navigation = useNavigation.getState();

    switch (entry.kind) {
      case "view":
        navigation.goTo(entry.id as View);
        return;
      case "project":
        navigation.select(entry.id);
        return;
      case "terminal": {
        const tab = terminals.find((one) => one.id === entry.id);

        if (tab?.project) {
          navigation.select(tab.project);
          navigation.setProjectTab(tab.project, tab.kind);
        }

        navigation.activateTerminal(entry.id);
        return;
      }
      default:
        onSwitchServer(entry.id);
        return;
    }
  }

  return (
    <CommandPalette
      entries={entries}
      onClose={onClose}
      onPick={pick}
      open={open}
    />
  );
}
