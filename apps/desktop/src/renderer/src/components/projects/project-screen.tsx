import type { Project, Service } from "@pupitre/shared/agent-protocol/state";
import { TerminalTabs } from "@renderer/components/terminals/terminal-tabs";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { agentsFrom, remoteEditors } from "@renderer/lib/modules";
import { group, useNavigation } from "@renderer/stores/navigation";
import { useProject } from "@renderer/stores/project";
import { useSnapshot } from "@renderer/stores/snapshot";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ProjectBody } from "./project-body";
import { ProjectDiff } from "./project-diff";
import { ProjectEditors } from "./project-editors";
import { ProjectHeader } from "./project-header";
import { ProjectLogs } from "./project-logs";
import { ProjectOverview } from "./project-overview";
import { ProjectTabBar } from "./project-tab-bar";
import {
  isProjectTab,
  isTerminalTab,
  type ProjectTab,
  tabsFor,
} from "./project-tabs";

/**
 * One project, its state and the four things you read about it.
 *
 * The screen owns the tab it is on and nothing else: every reading of the
 * server goes through the project store, and every command through the snapshot
 * one. `project.git_status` is asked here on arrival — it leaves the machine —
 * and never again unless the reader asks.
 */

interface Props {
  serverId: string;
  project: Project;
  services: readonly Service[];
  onRemoved: () => void;
}

export function ProjectScreen({
  serverId,
  project,
  services,
  onRemoved,
}: Props) {
  const [tab, setTabState] = useState<ProjectTab>("overview");
  const [syncing, setSyncing] = useState(false);

  const projectTabs = useNavigation((s) => s.projectTabs);
  const setProjectTab = useNavigation((s) => s.setProjectTab);
  const terminals = useNavigation((s) => s.terminals);
  const activeTabs = useNavigation((s) => s.activeTabs);
  const terminalStates = useNavigation((s) => s.terminalStates);
  const ensureTerminal = useNavigation((s) => s.ensureTerminal);
  const openTerminal = useNavigation((s) => s.openTerminal);
  const closeTerminal = useNavigation((s) => s.closeTerminal);
  const activateTerminal = useNavigation((s) => s.activateTerminal);
  const renameTerminal = useNavigation((s) => s.renameTerminal);

  const store = useProject();
  const busy = useSnapshot((s) => s.busy) === project.name;
  const act = useSnapshot((s) => s.act);
  const announce = useSnapshot((s) => s.announce);

  const name = project.name;
  const open = store.open;
  const readTree = store.readTree;

  /**
   * Switching tabs writes it down, so coming back to this project reopens the
   * tab you left it on. Every caller goes through here — a `setTabState` left
   * somewhere would be a tab that silently stops being remembered.
   */
  const setTab = useCallback(
    (next: ProjectTab) => {
      setTabState(next);
      setProjectTab(name, next);
    },
    [name, setProjectTab]
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: projectTabs is read once, on arrival — re-running on every remembered tab would drag the view back
  useEffect(() => {
    // Restoring is not a choice the reader just made, so `setTabState`: writing
    // it back would be noise.
    const saved = projectTabs[name];

    setTabState(isProjectTab(saved) ? saved : "overview");
    open(serverId, name);
  }, [serverId, name, open]);

  useEffect(() => {
    if (isTerminalTab(tab)) {
      ensureTerminal(name, tab);
    }

    if (tab === "diff") {
      readTree(serverId, name);
    }
  }, [tab, name, serverId, ensureTerminal, readTree]);

  const repo =
    store.branches.status === "read" ? store.branches.branches.repo : true;
  const agents = agentsFrom(services).join(" ");
  const tabs = useMemo(
    () => tabsFor({ agents: agents.split(" ").filter(Boolean), repo }),
    [agents, repo]
  );

  // A remembered tab the project no longer offers falls back to the overview:
  // an agent uninstalled, a folder that is no longer a repository.
  useEffect(() => {
    if (!tabs.includes(tab)) {
      setTabState("overview");
    }
  }, [tabs, tab]);

  const git = store.git.status === "read" ? store.git.git : null;
  const root = git?.root || null;

  async function sync() {
    setSyncing(true);
    await store.sync(serverId, name);
    setSyncing(false);
  }

  async function remove() {
    const answer = await window.pupitre.removeProject(serverId, name);

    if (answer.ok) {
      onRemoved();
    } else {
      announce(answer.error);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <ProjectHeader
        busy={busy}
        editors={
          <ProjectEditors
            editors={remoteEditors(services)}
            onOpen={(editor, path) =>
              window.pupitre.openInEditor(serverId, editor, path)
            }
            root={root}
          />
        }
        git={git}
        onAct={(action, target) => act(action, serverId, target)}
        onSeeDiff={() => setTab("diff")}
        onSync={sync}
        project={project}
        syncing={syncing}
      >
        <ProjectTabBar
          active={tab}
          counts={{ diff: git?.changed ?? 0 }}
          onSelect={setTab}
          sessions={{
            claude: group(terminals, name, "claude"),
            codex: group(terminals, name, "codex"),
            hermes: group(terminals, name, "hermes"),
            shell: group(terminals, name, "shell"),
          }}
          states={terminalStates}
          tabs={tabs}
        />
      </ProjectHeader>

      {store.problem ? (
        <div className="px-6 pt-3">
          <ErrorNotice error={store.problem} />
        </div>
      ) : null}

      <div className="min-h-0 flex-1">
        <ProjectBody
          diff={
            <ProjectDiff
              diff={store.diff}
              onReload={() => store.readTree(serverId, name)}
              onRetryDiff={() => {
                if (store.diff.status !== "idle") {
                  store.readDiff(serverId, name, store.diff.path);
                }
              }}
              onSelect={(path) => store.readDiff(serverId, name, path)}
              selected={store.diff.status === "idle" ? null : store.diff.path}
              tree={store.tree}
            />
          }
          logs={<ProjectLogs project={name} serverId={serverId} />}
          overview={
            <ProjectOverview
              branches={store.branches}
              git={store.git}
              onCheckGit={() => store.readGit(serverId, name)}
              onCheckout={(branch) => store.checkout(serverId, name, branch)}
              onRemove={remove}
              project={project}
              switching={store.switching}
            />
          }
          tab={tab}
          terminals={(kind) => (
            <TerminalTabs
              active={activeTabs[`${name}:${kind}`] ?? null}
              kind={kind}
              onActivate={activateTerminal}
              onClose={closeTerminal}
              onNew={() => openTerminal(name, kind)}
              onRename={renameTerminal}
              project={name}
              sessions={group(terminals, name, kind)}
              states={terminalStates}
            />
          )}
        />
      </div>
    </div>
  );
}
