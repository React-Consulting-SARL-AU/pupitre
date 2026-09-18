import type { ReactNode } from "react";
import type { ProjectTab } from "./project-tabs";

/**
 * Which panel a tab shows, as a lookup rather than a chain of conditions.
 *
 * A tab added tomorrow is a key here, not another branch in a render function.
 */
export function ProjectBody({
  tab,
  ...panels
}: Record<ProjectTab, ReactNode> & { tab: ProjectTab }) {
  return panels[tab];
}
