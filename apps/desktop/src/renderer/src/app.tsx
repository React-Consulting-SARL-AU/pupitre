import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AccountFailedScreen } from "./components/account/account-failed-screen";
import { AccountGateScreen } from "./components/account/account-gate-screen";
import { AccountReadingScreen } from "./components/account/account-reading-screen";
import { ActivityPanel } from "./components/activity/activity-panel";
import { DashboardPanel } from "./components/dashboard/dashboard-panel";
import { FilesScreen } from "./components/files/files-screen";
import { OnboardingFlow } from "./components/onboarding/onboarding-flow";
import { ProjectAddScreen } from "./components/projects/project-add-screen";
import { ProjectScreen } from "./components/projects/project-screen";
import { ServicesScreen } from "./components/services/services-screen";
import {
  SettingsScreen,
  type SettingsSection,
} from "./components/settings/settings-screen";
import { AppPalette } from "./components/shell/app-palette";
import { AppSidebar } from "./components/shell/app-sidebar";
import { HistoryArrows } from "./components/shell/history-arrows";
import { NoServerScreen } from "./components/shell/no-server-screen";
import { ScreenBoundary } from "./components/shell/screen-boundary";
import { ServerLinkNotice } from "./components/shell/server-link-notice";
import { ServerRestrictedNotice } from "./components/shell/server-restricted-notice";
import { ServerTerminalsScreen } from "./components/shell/server-terminals-screen";
import { SignOutDialog } from "./components/shell/sign-out-dialog";
import { ShotsScreen } from "./components/shots/shots-screen";
import { ErrorNotice } from "./components/ui/error-notice";
import { WindowBand } from "./components/ui/window-band";
import { AgentUpdateBanner } from "./components/updates/agent-update-banner";
import { noteProjects, noteServer } from "./lib/completion";
import { poll } from "./lib/poll";
import { attachedSessions } from "./lib/sessions";
import { shellScreen } from "./lib/shell-screen";
import { useHistoryShortcuts } from "./lib/use-history-shortcuts";
import { useMainCommands } from "./lib/use-main-commands";
import { usePaletteShortcut } from "./lib/use-palette-shortcut";
import { usePlatformSync } from "./lib/use-platform-sync";
import { accountOf, useAccount } from "./stores/account";
import { announces, useAgentUpdate } from "./stores/agent-update";
import { useChannel } from "./stores/channel";
import { useNavigation, type View } from "./stores/navigation";
import { useOnboarding } from "./stores/onboarding";
import { exposureOf } from "./stores/project-add";
import { repairable, useReenroll } from "./stores/reenroll";
import { serversIn, useServers } from "./stores/servers";
import {
  rebootingOf,
  snapshotOf,
  staleOf,
  useSnapshot,
} from "./stores/snapshot";
import { useTerminals } from "./stores/terminals";

/** The dashboard is the state of the machine: it is worth a beat of its own. */
const POLL_MS = 3000;

/** A full `ps` is not: it changes more slowly than a project's state. */
const POLL_PROCESSES_MS = 8000;

/** A shell of its own, lost alone when it throws: the window stays. */
function guarded(view: string, screen: ReactNode): ReactNode {
  return <ScreenBoundary view={view}>{screen}</ScreenBoundary>;
}

export function App() {
  // Where the settings open when a screen sent the reader there to repair
  // something: a connection to make, and then the way back to their draft.
  const [settingsSection, setSettingsSection] =
    useState<SettingsSection>("servers");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const onboarding = useOnboarding((s) => s.step);
  const openOnboarding = useOnboarding((s) => s.open);
  const beginOnboarding = useOnboarding((s) => s.begin);

  const config = useServers((s) => s.config);
  const loadServers = useServers((s) => s.load);

  const accountView = useAccount((s) => s.view);
  const readAccount = useAccount((s) => s.read);
  const bypassed = useAccount((s) => s.bypassed);

  const view = useNavigation((s) => s.view);
  const selection = useNavigation((s) => s.selection);
  const terminals = useNavigation((s) => s.terminals);
  const activeTerminal = useNavigation((s) => s.activeTerminal);
  const terminalStates = useNavigation((s) => s.terminalStates);
  const cursor = useNavigation((s) => s.cursor);
  const historyLength = useNavigation((s) => s.history.length);
  const goTo = useNavigation((s) => s.goTo);
  const openService = useNavigation((s) => s.openService);
  const serviceFocus = useNavigation((s) => s.serviceFocus);
  const select = useNavigation((s) => s.select);
  const goBack = useNavigation((s) => s.back);
  const goForward = useNavigation((s) => s.forward);
  const settle = useNavigation((s) => s.settle);
  const openTerminal = useNavigation((s) => s.openTerminal);
  const closeTerminal = useNavigation((s) => s.closeTerminal);
  const activateTerminal = useNavigation((s) => s.activateTerminal);
  const renameTerminal = useNavigation((s) => s.renameTerminal);
  const noteStates = useNavigation((s) => s.noteStates);
  const setProjectTab = useNavigation((s) => s.setProjectTab);
  const resetNavigation = useNavigation((s) => s.reset);

  const snapshotState = useSnapshot((s) => s.state);
  const processes = useSnapshot((s) => s.processes);
  const processesProblem = useSnapshot((s) => s.processesProblem);
  const lingering = useSnapshot((s) => s.lingering);
  const busy = useSnapshot((s) => s.busy);
  const problem = useSnapshot((s) => s.problem);
  const read = useSnapshot((s) => s.read);
  const readProcesses = useSnapshot((s) => s.readProcesses);
  const forget = useSnapshot((s) => s.forget);
  const act = useSnapshot((s) => s.act);
  const stopProcess = useSnapshot((s) => s.stopProcess);
  const cleanSessions = useSnapshot((s) => s.cleanSessions);
  const reboot = useSnapshot((s) => s.reboot);
  const announceProblem = useSnapshot((s) => s.announce);

  const updateState = useAgentUpdate((s) => s.state);
  const updateHidden = useAgentUpdate((s) => s.hidden);
  const updateJournal = useAgentUpdate((s) => s.journal);
  const upgrade = useAgentUpdate((s) => s.upgrade);
  const migration = useAgentUpdate((s) => s.migration);
  const readUpdate = useAgentUpdate((s) => s.read);
  const forgetUpdate = useAgentUpdate((s) => s.forget);
  const hideUpdate = useAgentUpdate((s) => s.hide);
  const upgradeAgent = useAgentUpdate((s) => s.upgradeAgent);
  const migrateConfig = useAgentUpdate((s) => s.migrateConfig);

  const reenroll = useReenroll((s) => s.state);
  const repair = useReenroll((s) => s.repair);

  const servers = serversIn(config);
  const server = servers.find((s) => s.id === config?.active) ?? null;
  const serverId = server?.id ?? null;
  const snapshot = snapshotOf(snapshotState, serverId);
  const channel = useChannel((s) => s.stateOf(serverId));

  usePlatformSync(serverId);
  useHistoryShortcuts();

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);

  usePaletteShortcut(openPalette);

  // The account is read before anything of a machine is: a build without a
  // usage right opens on the account, and the list of servers it would show is
  // not what the reader has to answer first. The list comes next: an onboarding
  // left half-way reopens where it stopped, and a machine that has left the
  // list stops it there.
  const boot = useCallback(async () => {
    await readAccount();

    if (useAccount.getState().view.status !== "read") {
      return;
    }

    await loadServers();
    useOnboarding.getState().resume();
  }, [loadServers, readAccount]);

  useEffect(() => {
    boot();
  }, [boot]);

  useEffect(() => window.pupitre.onTerminalStates(noteStates), [noteStates]);

  useEffect(() => useChannel.getState().listen(), []);

  // A session that prints a login address: only the main process saw the
  // address, and only the host comes here.
  useEffect(() => {
    const link = window.pupitre.onTerminalLink((payload) =>
      useTerminals.getState().noteLink(payload.id, payload.host)
    );
    const exit = window.pupitre.onTerminalExit((payload) =>
      useTerminals.getState().noteExit(payload.id, payload.code)
    );

    return () => {
      link();
      exit();
    };
  }, []);

  useEffect(() => {
    noteServer(serverId);

    if (!serverId) {
      forget();

      return;
    }

    const state = poll(() => read(serverId), POLL_MS);
    const table = poll(() => readProcesses(serverId), POLL_PROCESSES_MS);

    return () => {
      state();
      table();
    };
  }, [serverId, read, readProcesses, forget]);

  const projects = snapshot?.projects;

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

  // The comparison is read once on arrival, and then on the platform's beat:
  // a server upgraded from elsewhere, or a release published since, has to
  // reach the banner without a relaunch.
  useEffect(() => {
    if (!serverId) {
      forgetUpdate();

      return;
    }

    readUpdate(serverId);
  }, [serverId, readUpdate, forgetUpdate]);

  const serversChanged = useCallback(() => {
    loadServers();
    resetNavigation();
  }, [loadServers, resetNavigation]);

  const switchServer = useCallback(
    async (id: string) => {
      await useServers.getState().activate(id);
      serversChanged();
    },
    [serversChanged]
  );

  const openSettings = useCallback(
    (section: SettingsSection) => {
      setSettingsSection(section);
      goTo("settings");
    },
    [goTo]
  );

  const mainCommands = useMemo(
    () => ({
      active: () => serverId,
      goTo,
      menu: {
        "new-terminal": () => openTerminal(null, "shell"),
        palette: () => setPaletteOpen(true),
        preferences: () => openSettings("appearance"),
        "sign-out": () => setSigningOut(true),
      },
      openSettings,
      readAccount,
      select,
      switchServer,
    }),
    [
      goTo,
      openSettings,
      openTerminal,
      readAccount,
      select,
      serverId,
      switchServer,
    ]
  );

  useMainCommands(mainCommands);

  const serverTerminals = useMemo(
    () => terminals.filter((terminal) => terminal.project === null),
    [terminals]
  );
  const attached = useMemo(() => attachedSessions(terminals), [terminals]);

  if (accountView.status === "failed") {
    return guarded(
      "account-failed",
      <AccountFailedScreen error={accountView.error} onRetry={boot} />
    );
  }

  const account = accountOf(accountView);

  // Until the keychain has answered there is no right to judge, and guessing
  // one would open the onboarding on a build that refuses to install.
  if (!account) {
    return <AccountReadingScreen />;
  }

  const shell = shellScreen({
    answered: snapshot !== null,
    bypassed,
    onboarding,
    serverId,
    signedIn: account.identity !== null,
    usage: account.usage,
    view,
  });

  if (shell === "account") {
    return guarded(
      shell,
      <AccountGateScreen
        account={account}
        onSettings={() => goTo("settings")}
      />
    );
  }

  if (shell === "onboarding") {
    return guarded(`${shell}:${onboarding}`, <OnboardingFlow />);
  }

  if (shell === "settings") {
    return guarded(
      shell,
      <SettingsScreen
        onBack={() => goTo("dashboard")}
        onChanged={serversChanged}
      />
    );
  }

  if (shell === "unready" || !(serverId && snapshot)) {
    return guarded(
      `unready:${serverId ?? ""}`,
      <NoServerScreen
        error={
          snapshotState.status === "unreachable" ? snapshotState.error : null
        }
        onAddServer={openOnboarding}
        onInstall={() =>
          serverId ? beginOnboarding(serverId) : openOnboarding()
        }
        onRetry={() => serverId && read(serverId)}
        onSettings={() => goTo("settings")}
        rebooting={rebootingOf(snapshotState, serverId)}
        server={server}
      />
    );
  }

  const project = snapshot.projects.find((p) => p.name === selection) ?? null;

  // The server's own screens take nothing but the server: a lookup, not a
  // branch each, so a view added tomorrow is one key here.
  const serverScreens: Partial<Record<View, ReactNode>> = {
    files: (
      <FilesScreen
        onTerminal={(dir) => openTerminal(null, "shell", dir)}
        serverId={serverId}
        services={snapshot.services}
      />
    ),
    shots: <ShotsScreen serverId={serverId} />,
  };

  return (
    <div className="relative grid h-full grid-cols-[224px_1fr]">
      <AppPalette
        onClose={closePalette}
        onSwitchServer={switchServer}
        open={paletteOpen}
        projects={snapshot.projects}
        server={server}
        servers={servers}
        terminals={terminals}
      />
      <SignOutDialog
        onCancel={() => setSigningOut(false)}
        onConfirm={async () => {
          await useAccount.getState().disconnect();
          setSigningOut(false);
        }}
        open={signingOut}
      />
      <AppSidebar
        activeTerminal={activeTerminal}
        allTerminals={terminals}
        onAddProject={() => goTo("project-add")}
        onCloseTerminal={closeTerminal}
        onNewTerminal={() => openTerminal(null, "shell")}
        onProject={select}
        onSwitchServer={switchServer}
        onTerminal={activateTerminal}
        onView={goTo}
        projects={snapshot.projects}
        selection={selection}
        server={server}
        servers={servers}
        states={terminalStates}
        terminals={serverTerminals}
        view={view}
      />

      <div className="flex min-w-0 flex-col bg-surface">
        <WindowBand className="px-2">
          <HistoryArrows
            canGoBack={cursor > 0}
            canGoForward={cursor < historyLength - 1}
            onBack={goBack}
            onForward={goForward}
          />
        </WindowBand>

        <ServerRestrictedNotice
          entitlement={snapshot.entitlement}
          onOpenConsole={() => window.pupitre.openUrl(account.consoleUrl)}
          onRepair={() => repair(serverId).then(() => read(serverId))}
          repair={reenroll}
          repairable={repairable(account)}
        />

        {announces(updateState, updateHidden) ? (
          <div className="clickable shrink-0 px-4 pt-2">
            <AgentUpdateBanner
              journal={updateJournal}
              migration={migration}
              onHide={hideUpdate}
              onMigrate={() => migrateConfig(serverId)}
              onUpgrade={() => upgradeAgent(serverId)}
              state={updateState}
              upgrade={upgrade}
            />
          </div>
        ) : null}

        <ServerLinkNotice
          channel={channel}
          onRetry={() => read(serverId)}
          serverName={server?.name}
          stale={staleOf(snapshotState, serverId)}
        />

        {problem ? (
          <div className="clickable shrink-0 px-4 py-2">
            <ErrorNotice
              error={problem}
              name="command"
              onDismiss={() => announceProblem(null)}
            />
          </div>
        ) : null}

        <ScreenBoundary view={view}>
          <div className="relative min-h-0 flex-1">
            {view === "dashboard" ? (
              <div className="absolute inset-0">
                <DashboardPanel
                  attached={attached}
                  busy={busy}
                  onAct={(action, name) => act(action, serverId, name)}
                  onAddProject={() => goTo("project-add")}
                  onCleanSessions={() => cleanSessions(serverId)}
                  onOpenProject={select}
                  onOpenService={openService}
                  onOpenTerminal={() => openTerminal(null, "shell")}
                  onReboot={() =>
                    reboot(serverId, server?.name ?? snapshot.machine.hostname)
                  }
                  onStopSession={(pid) => stopProcess(serverId, pid)}
                  snapshot={snapshot}
                />
              </div>
            ) : null}

            {/*
              The project is opened once the snapshot lists it: selecting a name
              the list does not hold yet would fall back on the first project.
            */}
            {view === "project-add" ? (
              <div className="absolute inset-0">
                <ProjectAddScreen
                  exposure={exposureOf(snapshot.services, server?.host)}
                  onCancel={() => goTo("dashboard")}
                  onConnect={() => {
                    setSettingsSection("connections");
                    goTo("settings");
                  }}
                  onFinish={(name) => read(serverId).then(() => select(name))}
                  onInstallModule={() => goTo("services")}
                  serverId={serverId}
                  serverName={server?.name}
                  services={snapshot.services.map((service) => service.id)}
                />
              </div>
            ) : null}

            {view === "project" && project ? (
              <div className="absolute inset-0">
                <ProjectScreen
                  host={server?.host}
                  onRemoved={() => goTo("dashboard")}
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
                  openAt={serviceFocus}
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
                  lingering={lingering}
                  onCleanSessions={() => cleanSessions(serverId)}
                  onReattach={(project, kind) => {
                    openTerminal(project, kind);
                    setProjectTab(project, kind);
                    select(project);
                  }}
                  onRetryProcesses={() => readProcesses(serverId)}
                  onStopProcess={(pid, force) =>
                    stopProcess(serverId, pid, force)
                  }
                  onStopSession={(pid) => stopProcess(serverId, pid)}
                  processes={processes}
                  processesProblem={processesProblem}
                  sessions={snapshot.sessions}
                />
              </div>
            ) : null}

            {serverScreens[view] ? (
              <div className="absolute inset-0">{serverScreens[view]}</div>
            ) : null}

            {view === "settings" ? (
              <div className="absolute inset-0">
                <SettingsScreen
                  onChanged={serversChanged}
                  openAt={settingsSection}
                />
              </div>
            ) : null}

            {view === "terminals" ? (
              <div className="absolute inset-0">
                <ServerTerminalsScreen
                  active={activeTerminal}
                  onActivate={activateTerminal}
                  onClose={closeTerminal}
                  onNew={openTerminal}
                  onRename={renameTerminal}
                  states={terminalStates}
                  terminals={serverTerminals}
                />
              </div>
            ) : null}
          </div>
        </ScreenBoundary>
      </div>
    </div>
  );
}
