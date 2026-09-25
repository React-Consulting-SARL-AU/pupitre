import type { ReactNode } from "react";
import type { ProjectTab } from "./project-tabs";

export function ProjectBody({
  tab,
  ...panels
}: Record<ProjectTab, ReactNode> & { tab: ProjectTab }) {
  return panels[tab];
}
