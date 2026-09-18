import type { DictionaryKey } from "@renderer/i18n/en";
import type { TerminalKind } from "@shared/terminals";

/**
 * The tabs of a project page, and what decides that one exists.
 *
 * Routing used to be a chain of ternaries in the view; it is a list here, so a
 * tab added tomorrow is one entry rather than one more branch in a render
 * function nobody can read.
 */

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

/** What comes back from storage is a string, and last run was another version. */
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

/**
 * The tabs this particular project offers.
 *
 * A folder that is not a repository gets no diff, for want of anything to
 * compare. Which agents the agents tab can start is the tab's own question.
 */
export function tabsFor({ repo }: { repo: boolean }): ProjectTab[] {
  return PROJECT_TABS.filter((tab) => tab !== "diff" || repo);
}

/** The tab a session of that kind sits under: the shells on one, the agents on the other. */
export function tabOfKind(kind: TerminalKind): ProjectTab {
  return kind === "shell" ? "terminals" : "agents";
}
