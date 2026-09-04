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
  "logs",
  "diff",
  "shell",
  "claude",
  "codex",
] as const;

export type ProjectTab = (typeof PROJECT_TABS)[number];

export const TERMINAL_TABS: readonly ProjectTab[] = [
  "shell",
  "claude",
  "codex",
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

export const TAB_LABEL: Record<ProjectTab, string> = {
  claude: "Claude",
  codex: "Codex",
  diff: "Diff",
  logs: "Journal",
  overview: "Vue d'ensemble",
  shell: "Terminal",
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

    if (tab === "claude" || tab === "codex") {
      return agents.includes(tab);
    }

    return true;
  });
}
