import type { TerminalKind } from "@shared/terminals";
import type { ReactNode } from "react";
import { isTerminalTab, type ProjectTab } from "./project-tabs";

/**
 * Which panel a tab shows, as a lookup rather than a chain of conditions.
 *
 * Every terminal tab draws the same panel with a different kind, so they share
 * one entry; the other three have one each. A tab added tomorrow is a key here,
 * not another branch in a render function.
 */
export function ProjectBody({
  tab,
  overview,
  logs,
  diff,
  terminals,
}: {
  tab: ProjectTab;
  overview: ReactNode;
  logs: ReactNode;
  diff: ReactNode;
  terminals: (kind: TerminalKind) => ReactNode;
}) {
  if (isTerminalTab(tab)) {
    return terminals(tab);
  }

  const panels: Record<"overview" | "logs" | "diff", ReactNode> = {
    diff,
    logs,
    overview,
  };

  return panels[tab];
}
