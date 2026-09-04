import { SquareTerminal, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ActivityPanel } from "./components/activity/activity-panel";
import { DashboardPanel } from "./components/dashboard/dashboard-panel";
import { OnboardingFlow } from "./components/onboarding/onboarding-flow";
import { ProjectScreen } from "./components/projects/project-screen";
import { SecretsPanel } from "./components/secrets/secrets-panel";
import { ServicesScreen } from "./components/services/services-screen";
import { SettingsScreen } from "./components/settings/settings-screen";
import { AppSidebar } from "./components/shell/app-sidebar";
import { ServerUnreadyScreen } from "./components/shell/server-unready-screen";
import { ShotsScreen } from "./components/shots/shots-screen";
import { TerminalTabs } from "./components/terminals/terminal-tabs";
import { EmptyState } from "./components/ui/empty-state";
import { ErrorNotice } from "./components/ui/error-notice";
import { IconButton } from "./components/ui/icon-button";
import { AgentUpdateBanner } from "./components/updates/agent-update-banner";
import { useTranslations } from "./i18n/use-translations";
import { noteProjects, noteServer } from "./lib/completion";
import { attachedSessions } from "./lib/sessions";
import { shellScreen } from "./lib/shell-screen";
import { announces, useAgentUpdate } from "./stores/agent-update";
import { useNavigation } from "./stores/navigation";
import { useOnboarding } from "./stores/onboarding";
import { useSecrets } from "./stores/secrets";
import { useServers } from "./stores/servers";
import { snapshotOf, useSnapshot } from "./stores/snapshot";
import { useTerminals } from "./stores/terminals";

/** The dashboard is the state of the machine: it is worth a beat of its own. */
const POLL_MS = 3000;

/** A full `ps` is not: it changes more slowly than a project's state. */
const POLL_PROCESSES_MS = 8000;

export function App() {
  const t = useTranslations();

  const onboarding = useOnboarding((s) => s.step);
  const openOnboarding = useOnboarding((s) => s.open);
  const beginOnboarding = useOnboarding((s) => s.begin);

  const config = useServers((s) => s.config);
  const loadServers = useServers((s) => s.load);

  const navigation = useNavigation();
  const snapshotState = useSnapshot((s) => s.state);
  const processes = useSnapshot((s) => s.processes);
  const busy = useSnapshot((s) => s.busy);
  const problem = useSnapshot((s) => s.problem);
  const store = useSnapshot();

  const secrets = useSecrets();
  const update = useAgentUpdate();
  const [openSecret, setOpenSecret] = useState<string | null>(null);

  const server = config?.servers.find((s) => s.id === config.active) ?? null;
  const serverId = server?.id ?? null;
  const snapshot = snapshotOf(snapshotState);

  useEffect(() => {
    loadServers();
    // An onboarding left half-way reopens where it stopped: the machine is in
    // the state the last step left it in, not the one this launch would guess.
    useOnboarding.getState().resume();
  }, [loadServers]);

  useEffect(
    () => window.pupitre.onTerminalStates(navigation.noteStates),
    [navigation.noteStates]
  );

  // A session that prints a login address, and the round trip that ends: both
  // come from the main process, which is the only side that saw the address.
  useEffect(() => {
    const link = window.pupitre.onTerminalLink((payload) =>
      useTerminals.getState().noteLink(payload.id, payload.host)
    );
    const closed = window.pupitre.onLoginClosed((id) =>
      useTerminals.getState().noteLoginClosed(id)
    );

    return () => {
      link();
      closed();
    };
  }, []);

  const { read, readProcesses, forget } = store;

  useEffect(() => {
    noteServer(serverId);

    if (!serverId) {
      forget();

      return;
    }

    read(serverId);
    readProcesses(serverId);

    const state = setInterval(() => read(serverId), POLL_MS);
    const table = setInterval(() => readProcesses(serverId), POLL_PROCESSES_MS);

    return () => {
      clearInterval(state);
      clearInterval(table);
    };
  }, [serverId, read, readProcesses, forget]);

  const projects = snapshot?.projects;
  const settle = navigation.settle;

  useEffect(() => {
    // Until the first snapshot lands there is no list to settle against, and
    // settling against an empty one would drop the project we remembered.
    if (!projects) {
      return;
    }

    const names = projects.map((project) => project.name);

    noteProjects(names);
    settle(names);
  }, [projects, settle]);

  const readUpdate = update.read;
  const forgetUpdate = update.forget;

  // The comparison is worth one call per server, not one per poll: what the app
  // carries does not change while it runs, and what the server runs only
  // changes when the update below has just replaced it.
  useEffect(() => {
    if (!serverId) {
      forgetUpdate();

      return;
    }

    readUpdate(serverId);
  }, [serverId, readUpdate, forgetUpdate]);

  const view = navigation.view;
  const readSecrets = secrets.read;

  useEffect(() => {
    if (serverId && view === "secrets") {
      readSecrets(serverId);
    }
  }, [serverId, view, readSecrets]);

  const serversChanged = useCallback(() => {
    loadServers();
    navigation.reset();
  }, [loadServers, navigation.reset]);

  const shell = shellScreen({
    answered: snapshot !== null,
    onboarding,
    serverId,
    view,
  });

  if (shell === "onboarding") {
    return <OnboardingFlow />;
  }

  if (shell === "settings") {
    return <SettingsScreen onChanged={serversChanged} />;
  }

  if (shell === "unready" || !(serverId && snapshot)) {
    return (
      <ServerUnreadyScreen
        error={
          snapshotState.status === "unreachable" ? snapshotState.error : null
        }
        onInstall={() =>
          serverId ? beginOnboarding(serverId) : openOnboarding()
        }
        onRetry={() => serverId && read(serverId)}
        onSettings={() => navigation.goTo("settings")}
        server={server}
      />
    );
  }

  const project =
    snapshot.projects.find((p) => p.name === navigation.selection) ?? null;
  const serverTerminals = navigation.terminals.filter(
    (terminal) => terminal.project === null
  );
  const attached = attachedSessions(navigation.terminals);

  return (
    <div className="grid h-full grid-cols-[224px_1fr]">
      <AppSidebar
        activeTerminal={navigation.activeTerminal}
        allTerminals={navigation.terminals}
        onCloseTerminal={navigation.closeTerminal}
        onNewTerminal={() => navigation.openTerminal(null, "shell")}
        onProject={navigation.select}
        onTerminal={navigation.activateTerminal}
        onView={navigation.goTo}
        projects={snapshot.projects}
        selection={navigation.selection}
        server={server}
        states={navigation.terminalStates}
        terminals={serverTerminals}
        view={view}
      />

      <div className="flex min-w-0 flex-col">
        <div className="draggable h-10 shrink-0 border-line border-b bg-base" />

        {announces(update.state, update.hidden) ? (
          <div className="clickable shrink-0 px-4 pt-2">
            <AgentUpdateBanner
              journal={update.journal}
              onHide={update.hide}
              onUpgrade={() => update.upgradeAgent(serverId)}
              state={update.state}
              upgrade={update.upgrade}
            />
          </div>
        ) : null}

        {problem ? (
          <div className="clickable shrink-0 px-4 py-2">
            <ErrorNotice error={problem} />
            <div className="mt-1 flex justify-end">
              <IconButton
                icon={X}
                label={t("common.hide")}
                onClick={() => store.announce(null)}
                size={12}
                variant="discreet"
              />
            </div>
          </div>
        ) : null}

        <div className="relative min-h-0 flex-1">
          {view === "dashboard" ? (
            <div className="absolute inset-0">
              <DashboardPanel
                attached={attached}
                busy={busy}
                onAct={(action, name) => store.act(action, serverId, name)}
                onCleanSessions={() => store.cleanSessions(serverId)}
                onOpenProject={navigation.select}
                onReboot={() => store.reboot(serverId)}
                onStopSession={(pid) => store.stopProcess(serverId, pid)}
                snapshot={snapshot}
              />
            </div>
          ) : null}

          {view === "project" && project ? (
            <div className="absolute inset-0">
              <ProjectScreen
                onRemoved={() => navigation.goTo("dashboard")}
                project={project}
                serverId={serverId}
                services={snapshot.services}
              />
            </div>
          ) : null}

          {view === "services" ? (
            <div className="absolute inset-0">
              <ServicesScreen
                onMachineName={(name) =>
                  serverId && useServers.getState().rename(serverId, name)
                }
                onTerminal={() => navigation.openTerminal(null, "shell")}
                serverId={serverId}
                serverName={server?.name}
                services={snapshot.services}
              />
            </div>
          ) : null}

          {view === "activity" ? (
            <div className="absolute inset-0">
              <ActivityPanel
                attached={attached}
                onCleanSessions={() => store.cleanSessions(serverId)}
                onStopProcess={(pid) => store.stopProcess(serverId, pid)}
                onStopSession={(pid) => store.stopProcess(serverId, pid)}
                processes={processes}
                sessions={snapshot.sessions}
              />
            </div>
          ) : null}

          {view === "shots" ? (
            <div className="absolute inset-0">
              <ShotsScreen serverId={serverId} />
            </div>
          ) : null}

          {view === "secrets" ? (
            <div className="absolute inset-0">
              <SecretsPanel
                onOpen={setOpenSecret}
                onReload={() => secrets.read(serverId)}
                onSave={async (key, value) => {
                  const ok = await secrets.save(serverId, key, value);

                  if (ok) {
                    setOpenSecret(null);
                  }
                }}
                open={openSecret}
                problem={secrets.problem}
                saved={secrets.saved}
                saving={secrets.saving}
                state={secrets.state}
              />
            </div>
          ) : null}

          {view === "settings" ? (
            <div className="absolute inset-0">
              <SettingsScreen onChanged={serversChanged} />
            </div>
          ) : null}

          {/*
            The server's own terminals — the projects' ones live on their page.
            Sessions survive unmounting: it is the `lib/terminals` registry that
            holds them, not React.
          */}
          {view === "terminals" ? (
            <div className="absolute inset-0">
              {serverTerminals.length === 0 ? (
                <EmptyState
                  detail={t("app.terminals.empty.detail")}
                  icon={SquareTerminal}
                  title={t("app.terminals.empty.title")}
                />
              ) : (
                <TerminalTabs
                  active={navigation.activeTerminal}
                  kind="shell"
                  onActivate={navigation.activateTerminal}
                  onClose={navigation.closeTerminal}
                  onNew={() => navigation.openTerminal(null, "shell")}
                  onRename={navigation.renameTerminal}
                  project={null}
                  sessions={serverTerminals}
                  states={navigation.terminalStates}
                />
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
