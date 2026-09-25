import type { DictionaryKey } from "@renderer/i18n/en";
import type { TerminalKind } from "@shared/terminals";

export const PROJECT_TABS = [
  "overview",
  "configuration",
  "logs",
  "diff",
  "files",
  "terminals",
  "agents",
] as const;

export type ProjectTab = (typeof PROJECT_TABS)[number];

/** A stored tab may come from another version of the app. */
export function isProjectTab(value: string | undefined): value is ProjectTab {
  return (
    value !== undefined && (PROJECT_TABS as readonly string[]).includes(value)
  );
}

export const TAB_LABEL: Record<ProjectTab, DictionaryKey> = {
  agents: "project.tab.agents",
  configuration: "project.tab.configuration",
  diff: "project.tab.diff",
  files: "project.tab.files",
  logs: "project.tab.logs",
  overview: "project.tab.overview",
  terminals: "project.tab.terminals",
};

export function tabsFor({ repo }: { repo: boolean }): ProjectTab[] {
  return PROJECT_TABS.filter((tab) => tab !== "diff" || repo);
}

export function tabOfKind(kind: TerminalKind): ProjectTab {
  return kind === "shell" ? "terminals" : "agents";
}
