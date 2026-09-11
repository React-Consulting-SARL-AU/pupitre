import type { Project, Service } from "@pupitre/shared/agent-protocol/state";
import { TerminalTabs } from "@renderer/components/terminals/terminal-tabs";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { Screen } from "@renderer/components/ui/screen";
import { ServiceLogo } from "@renderer/components/ui/service-logo";
import { useTranslations } from "@renderer/i18n/use-translations";
import {
  agentsFrom,
  remoteEditors,
  runtimeModuleOf,
} from "@renderer/lib/modules";
import { group, useNavigation } from "@renderer/stores/navigation";
import { useProject } from "@renderer/stores/project";
import { useSnapshot } from "@renderer/stores/snapshot";
import { Package } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ProjectActions } from "./project-actions";
import { ProjectBody } from "./project-body";
import { ProjectConfigScreen } from "./project-config-screen";
import { ProjectDiff } from "./project-diff";
import { ProjectEditors } from "./project-editors";
import { ProjectFiles } from "./project-files";
import { ProjectLogs } from "./project-logs";
import { ProjectMeta } from "./project-meta";
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
  /** The server's address, said on the configuration when a Caddy exposure asks the reader to point their DNS at it. */
  host?: string;
  onRemoved: () => void;
}

export function ProjectScreen({
  serverId,
  project,
  services,
  host,
  onRemoved,
}: Props) {
  const t = useTranslations();

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
  const readEnv = store.readEnv;

  const readKeys = useCallback(
    () => readEnv(serverId, name),
    [readEnv, serverId, name]
  );

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
  const editors = remoteEditors(services);

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
    <Screen
      actions={
        <ProjectActions
          busy={busy}
          editors={
            <ProjectEditors
              editors={editors}
              onOpen={(editor, path) =>
                window.pupitre.openInEditor(serverId, editor, path)
              }
              root={root}
            />
          }
          onAct={(action, target) => act(action, serverId, target)}
          onSync={sync}
          project={project}
          syncing={syncing}
        />
      }
      eyebrow={t("project.header.eyebrow")}
      fill
      leading={
        <ServiceLogo
          fallback={Package}
          moduleId={runtimeModuleOf(project.pkgmgr)}
          name={project.pkgmgr}
          size={20}
        />
      }
      meta={
        <ProjectMeta
          git={git}
          onSeeDiff={() => setTab("diff")}
          project={project}
        />
      }
      tabs={
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
      }
      title={project.name}
    >
      <div className="flex h-full min-h-0 flex-col">
        {store.problem ? (
          <div className="shrink-0 px-8 pt-4">
            <ErrorNotice error={store.problem} />
          </div>
        ) : null}

        <div className="min-h-0 flex-1">
          <ProjectBody
            configuration={
              <ProjectConfigScreen
                host={host}
                project={project}
                serverId={serverId}
                services={services}
              />
            }
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
            files={
              <ProjectFiles
                onTerminal={(dir) => {
                  openTerminal(name, "shell", dir);
                  setTab("shell");
                }}
                project={project}
                serverId={serverId}
                services={services}
              />
            }
            logs={<ProjectLogs project={name} serverId={serverId} />}
            overview={
              <ProjectOverview
                branches={store.branches}
                env={store.env}
                git={store.git}
                onCheckGit={() => store.readGit(serverId, name)}
                onCheckout={(branch) => store.checkout(serverId, name, branch)}
                onConfigure={() => setTab("configuration")}
                onReadEnv={readKeys}
                onRegenerateEnv={() => readEnv(serverId, name, true)}
                onRemove={remove}
                onSync={sync}
                project={project}
                switching={store.switching}
                syncing={syncing}
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
    </Screen>
  );
}
