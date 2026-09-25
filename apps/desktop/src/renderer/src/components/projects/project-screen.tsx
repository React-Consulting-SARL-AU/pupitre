import type { Project, Service } from "@pupitre/shared/agent-protocol/state";
import { TerminalTabs } from "@renderer/components/terminals/terminal-tabs";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { Screen } from "@renderer/components/ui/screen";
import { ServiceLogo } from "@renderer/components/ui/service-logo";
import { useTranslations } from "@renderer/i18n/use-translations";
import {
  agentModulesFrom,
  remoteEditors,
  runtimeModuleOf,
} from "@renderer/lib/modules";
import { unlessHeld } from "@renderer/lib/refusals";
import { useProjectShortcuts } from "@renderer/lib/use-project-shortcuts";
import { group, groupKey, useNavigation } from "@renderer/stores/navigation";
import { useProject } from "@renderer/stores/project";
import { serversIn, useServers } from "@renderer/stores/servers";
import { useSnapshot } from "@renderer/stores/snapshot";
import { useSshShare } from "@renderer/stores/ssh-share";
import { Package } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ProjectActions } from "./project-actions";
import { ProjectAgentsPicker } from "./project-agents-picker";
import { ProjectBody } from "./project-body";
import { ProjectConfigScreen } from "./project-config-screen";
import { ProjectDiff } from "./project-diff";
import { ProjectEditors } from "./project-editors";
import { ProjectFiles } from "./project-files";
import { ProjectLogs } from "./project-logs";
import { ProjectMeta } from "./project-meta";
import { ProjectOverview } from "./project-overview";
import { ProjectTabBar } from "./project-tab-bar";
import { type ProjectTab, tabsFor } from "./project-tabs";

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

  const [syncing, setSyncing] = useState(false);

  const savedTab = useNavigation(
    (s) => s.projectTabs[project.name] ?? "overview"
  );
  const setProjectTab = useNavigation((s) => s.setProjectTab);
  const goTo = useNavigation((s) => s.goTo);
  const terminals = useNavigation((s) => s.terminals);
  const activeTabs = useNavigation((s) => s.activeTabs);
  const terminalStates = useNavigation((s) => s.terminalStates);
  const ensureTerminal = useNavigation((s) => s.ensureTerminal);
  const openTerminal = useNavigation((s) => s.openTerminal);
  const closeTerminal = useNavigation((s) => s.askCloseTerminal);
  const activateTerminal = useNavigation((s) => s.activateTerminal);
  const renameTerminal = useNavigation((s) => s.renameTerminal);

  const store = useProject();
  const problem = unlessHeld(store.problem);
  const busy = useSnapshot((s) => s.busy) === project.name;
  const act = useSnapshot((s) => s.act);
  const announce = useSnapshot((s) => s.announce);
  const readSnapshot = useSnapshot((s) => s.read);

  const name = project.name;
  const mainProcess = project.processes[0] ?? {
    pkgmgr: "none" as const,
  };
  const open = store.open;
  const readTree = store.readTree;
  const readEnv = store.readEnv;

  const readKeys = useCallback(
    () => readEnv(serverId, name),
    [readEnv, serverId, name]
  );

  // The tab lives in the navigation store, so coming back to this project
  // reopens the tab you left it on, and a shortcut can switch it from outside.
  const setTab = useCallback(
    (next: ProjectTab) => setProjectTab(name, next),
    [name, setProjectTab]
  );

  useEffect(() => {
    open(serverId, name);
  }, [serverId, name, open]);

  const repo =
    store.branches.status === "read" ? store.branches.branches.repo : true;
  const tabs = useMemo(() => tabsFor({ repo }), [repo]);
  // A remembered tab the project no longer offers falls back to the overview:
  // a folder that is no longer a repository.
  const tab = tabs.includes(savedTab) ? savedTab : "overview";

  useProjectShortcuts(tabs, tab, setTab);

  useEffect(() => {
    if (tab === "terminals") {
      ensureTerminal(name);
    }

    if (tab === "diff") {
      readTree(serverId, name);
    }
  }, [tab, name, serverId, ensureTerminal, readTree]);

  const agentModules = useMemo(() => agentModulesFrom(services), [services]);
  const agents = useMemo(
    () => agentModules.map((held) => held.agent),
    [agentModules]
  );
  const shells = group(terminals, name, "shell");
  const agentSessions = group(terminals, name, "agent");

  const git = store.git.status === "read" ? store.git.git : null;
  const root = git?.root || null;
  const editors = remoteEditors(services);

  const server = useServers((s) =>
    serversIn(s.config).find((held) => held.id === serverId)
  );
  const sshShare = useSshShare((s) => s.state);
  const readSshShare = useSshShare((s) => s.read);
  const setSshShare = useSshShare((s) => s.set);

  useEffect(() => {
    if (editors.length > 0 && !sshShare) {
      readSshShare();
    }
  }, [editors.length, sshShare, readSshShare]);

  const shareFirst =
    server?.origin === "app" && !sshShare?.shared
      ? (sshShare?.userConfigPath ?? "~/.ssh/config")
      : null;

  async function sync() {
    setSyncing(true);
    await store.sync(serverId, name);
    setSyncing(false);
  }

  // The dashboard is read again before it is shown: a card of the project
  // just removed, with live buttons, would otherwise sit there until the beat.
  async function remove() {
    const answer = await window.pupitre.removeProject(serverId, name);

    if (answer.ok) {
      await readSnapshot(serverId);
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
              onShare={() => setSshShare(true)}
              root={root}
              share={shareFirst}
            />
          }
          onAct={(action, target) => act(action, serverId, target)}
          onRemove={remove}
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
          moduleId={runtimeModuleOf(mainProcess.pkgmgr)}
          name={mainProcess.pkgmgr}
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
          counts={{
            agents: agentSessions.length,
            diff: git?.changed ?? 0,
            terminals: shells.length,
          }}
          onSelect={setTab}
          sessions={{ agents: agentSessions, terminals: shells }}
          states={terminalStates}
          tabs={tabs}
        />
      }
      title={project.name}
    >
      <div className="flex h-full min-h-0 flex-col">
        {problem ? (
          <div className="shrink-0 px-8 pt-4">
            <ErrorNotice error={problem} />
          </div>
        ) : null}

        <div className="min-h-0 flex-1">
          <ProjectBody
            agents={
              agentSessions.length === 0 ? (
                <ProjectAgentsPicker
                  agents={agentModules}
                  onInstall={() => goTo("services")}
                  onPick={(agent) => openTerminal(name, agent)}
                />
              ) : (
                <TerminalTabs
                  active={activeTabs[groupKey(name, "agent")] ?? null}
                  kinds={agents}
                  onActivate={activateTerminal}
                  onClose={closeTerminal}
                  onNew={(kind) => openTerminal(name, kind)}
                  onRename={renameTerminal}
                  project={name}
                  sessions={agentSessions}
                  states={terminalStates}
                />
              )
            }
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
                  setTab("terminals");
                }}
                project={project}
                serverId={serverId}
                services={services}
              />
            }
            logs={
              <ProjectLogs
                processes={project.processes.map((process) => process.id)}
                project={name}
                serverId={serverId}
              />
            }
            overview={
              <ProjectOverview
                branches={store.branches}
                busy={busy}
                env={store.env}
                git={store.git}
                onAct={(action, process) =>
                  act(action, serverId, name, process)
                }
                onCheckGit={() => store.readGit(serverId, name)}
                onCheckout={(branch) => store.checkout(serverId, name, branch)}
                onConfigure={() => setTab("configuration")}
                onReadEnv={readKeys}
                onRegenerateEnv={() => readEnv(serverId, name, true)}
                onSync={sync}
                project={project}
                switching={store.switching}
                syncing={syncing}
              />
            }
            tab={tab}
            terminals={
              <TerminalTabs
                active={activeTabs[groupKey(name, "shell")] ?? null}
                kinds={["shell"]}
                onActivate={activateTerminal}
                onClose={closeTerminal}
                onNew={(kind) => openTerminal(name, kind)}
                onRename={renameTerminal}
                project={name}
                sessions={shells}
                states={terminalStates}
              />
            }
          />
        </div>
      </div>
    </Screen>
  );
}
