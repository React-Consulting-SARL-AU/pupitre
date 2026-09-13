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
  "shell",
  "claude",
  "codex",
  "cursor",
  "opencode",
  "hermes",
] as const;

export type ProjectTab = (typeof PROJECT_TABS)[number];

export const TERMINAL_TABS: readonly ProjectTab[] = [
  "shell",
  "claude",
  "codex",
  "cursor",
  "opencode",
  "hermes",
];

const AGENT_TABS: readonly ProjectTab[] = [
  "claude",
  "codex",
  "cursor",
  "opencode",
  "hermes",
];

export function isTerminalTab(tab: ProjectTab): tab is TerminalKind {
  return TERMINAL_TABS.includes(tab);
}

/** What comes back from storage is a string, and last run was another version. */
export function isProjectTab(value: string | undefined): value is ProjectTab {
  return (
    value !== undefined && (PROJECT_TABS as readonly string[]).includes(value)
  );
}

export const TAB_LABEL: Record<ProjectTab, DictionaryKey> = {
  claude: "project.tab.claude",
  codex: "project.tab.codex",
  configuration: "project.tab.configuration",
  cursor: "project.tab.cursor",
  diff: "project.tab.diff",
  files: "project.tab.files",
  hermes: "project.tab.hermes",
  logs: "project.tab.logs",
  opencode: "project.tab.opencode",
  overview: "project.tab.overview",
  shell: "project.tab.shell",
};

/**
 * The tabs this particular project offers.
 *
 * An agent that is not installed on the machine gets no tab: opening "Claude"
 * where it does not exist gives a terminal that dies at once. A folder that is
 * not a repository gets no diff, for want of anything to compare.
 */
export function tabsFor({
  agents,
  repo,
}: {
  agents: readonly string[];
  repo: boolean;
}): ProjectTab[] {
  return PROJECT_TABS.filter((tab) => {
    if (tab === "diff") {
      return repo;
    }

    if (AGENT_TABS.includes(tab)) {
      return agents.includes(tab);
    }

    return true;
  });
}
