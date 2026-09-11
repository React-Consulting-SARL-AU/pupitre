import type { TerminalKind } from "@shared/terminals";
import type { ReactNode } from "react";
import { isTerminalTab, type ProjectTab } from "./project-tabs";

/**
 * Which panel a tab shows, as a lookup rather than a chain of conditions.
 *
 * Every terminal tab draws the same panel with a different kind, so they share
 * one entry; the others have one each. A tab added tomorrow is a key here,
 * not another branch in a render function.
 */
export function ProjectBody({
  tab,
  overview,
  configuration,
  logs,
  diff,
  files,
  terminals,
}: {
  tab: ProjectTab;
  overview: ReactNode;
  configuration: ReactNode;
  logs: ReactNode;
  diff: ReactNode;
  files: ReactNode;
  terminals: (kind: TerminalKind) => ReactNode;
}) {
  if (isTerminalTab(tab)) {
    return terminals(tab);
  }

  const panels: Record<
    "overview" | "configuration" | "logs" | "diff" | "files",
    ReactNode
  > = {
    configuration,
    diff,
    files,
    logs,
    overview,
  };

  return panels[tab];
}
