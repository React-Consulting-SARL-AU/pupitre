import { useEffect } from "react";
import { ConnectionSetup } from "./components/ConnectionSetup";
import { Dashboard } from "./components/Dashboard";
import { ProjectView } from "./components/ProjectView";
import { Secrets } from "./components/Secrets";
import { Settings } from "./components/Settings";
import { Sidebar } from "./components/Sidebar";
import { TerminalTabs } from "./components/TerminalTabs";
import { noteProjects } from "./lib/completion";
import { selectedProject, useAppState } from "./stores/state";

const POLL_MS = 1500;
const POLL_PROCESSES_MS = 4000;
const POLL_RECONNECT_MS = 5000;
/**
 * Remote repositories are re-read rarely.
 *
 * Each round goes out to the network once per repository: it is the only poll in
 * the app that leaves the machine, and nobody pushes often enough to justify
 * more.
 */
const POLL_GIT_MS = 300_000;

export function App() {
  const state = useAppState();
  const {
    snapshot,
    capabilities,
    processes,
    sessions,
    servers,
    connection,
    view,
    selection,
    terminals,
    activeTerminal,
    message,
    busy,
    refresh,
    refreshProcesses,
    loadCapabilities,
    loadServers,
    checkConnection,
    refreshGit,
  } = state;

  useEffect(() => {
    loadServers();
    checkConnection();
  }, [loadServers, checkConnection]);

  useEffect(
    () => window.pupitre.onTerminalStates(state.noteStates),
    [state.noteStates]
  );

  const projects = snapshot?.projects;
  useEffect(() => {
    noteProjects(projects?.map((p) => p.name) ?? []);
  }, [projects]);

  // Whatever blocks the connection is most often fixed elsewhere — a keychain to
  // unlock, a VPN to reopen. The app re-checks on its own, otherwise it stays on
  // the wizard when everything is already back.
  useEffect(() => {
    if (!connection || connection.connected) {
      return;
    }
    const round = setInterval(checkConnection, POLL_RECONNECT_MS);
    window.addEventListener("focus", checkConnection);
    return () => {
      clearInterval(round);
      window.removeEventListener("focus", checkConnection);
    };
  }, [connection, checkConnection]);

  useEffect(() => {
    if (!connection?.connected) {
      return;
    }
    refresh();
    refreshProcesses();
    // What the machine can do does not change along the way: we ask once, on
    // connection, and the interface settles to it.
    loadCapabilities();
    const a = setInterval(refresh, POLL_MS);
    // Processes cost a full `ps`: we re-read them less often, they change more
    // slowly than a service state.
    const b = setInterval(refreshProcesses, POLL_PROCESSES_MS);
    return () => {
      clearInterval(a);
      clearInterval(b);
    };
  }, [connection?.connected, refresh, refreshProcesses, loadCapabilities]);

  // Repositories wait not for the connection but for the first poll: the main
  // process only has the project list once the snapshot has been read.
  const projectsKnown = (snapshot?.projects.length ?? 0) > 0;

  useEffect(() => {
    if (!projectsKnown) {
      return;
    }
    refreshGit(true);
    const round = setInterval(() => refreshGit(true), POLL_GIT_MS);
    return () => clearInterval(round);
  }, [projectsKnown, refreshGit]);

  const project = selectedProject(snapshot, selection);
  const activeServer = servers?.servers.find((s) => s.id === servers.active);
  const serverTerminals = terminals.filter((t) => t.project === null);

  // The settings stay reachable even with no connection: that is often where you
  // go when it does not come up.
  if (connection && !connection.connected && view !== "settings") {
    return (
      <ConnectionSetup
        connection={connection}
        onRetry={checkConnection}
        onSettings={() => state.goTo("settings")}
      />
    );
  }

  return (
    <div className="grid h-full grid-cols-[224px_1fr]">
      <Sidebar
        activeTerminal={activeTerminal}
        allTerminals={terminals}
        capabilities={capabilities}
        onCloseTerminal={state.closeTerminal}
        onNewTerminal={() => state.openTerminal(null, "shell")}
        onProject={state.select}
        onTerminal={state.activateTerminal}
        onView={state.goTo}
        projects={snapshot?.projects ?? []}
        selection={selection}
        servers={servers}
        states={state.terminalStates}
        terminals={serverTerminals}
        view={view}
      />

      <div className="flex min-w-0 flex-col">
        <div className="draggable h-10 shrink-0 border-line border-b bg-base" />

        {message ? (
          <button
            className="clickable shrink-0 animate-[fade-in_200ms_ease-out] border-danger border-l-2 bg-danger/10 px-4 py-2 text-left font-mono text-[11px] text-danger"
            onClick={() => state.announce(null)}
            type="button"
          >
            {message}
          </button>
        ) : null}

        <div className="relative min-h-0 flex-1">
          {view === "dashboard" && snapshot ? (
            <div className="absolute inset-0 animate-[fade-in_220ms_ease-out]">
              <Dashboard
                busy={busy}
                capabilities={capabilities}
                cpuPercent={state.cpuPercent}
                git={state.git}
                gitBusy={state.gitBusy}
                gitCheckedAt={state.gitCheckedAt}
                onAct={state.act}
                onAll={state.actOnAll}
                onCheckGit={() => refreshGit(true)}
                onCleanSessions={state.cleanSessions}
                onPull={state.pull}
                onPullAll={state.pullAll}
                onReboot={state.rebootServer}
                onSelect={state.select}
                onStopProcess={state.stopProcess}
                onStopSession={state.stopSession}
                onTerminal={state.openTerminal}
                processes={processes}
                sessions={sessions}
                snapshot={snapshot}
              />
            </div>
          ) : null}

          {view === "project" && project ? (
            <div className="absolute inset-0 animate-[fade-in_220ms_ease-out]">
              <ProjectView
                busy={busy === project.name}
                capabilities={capabilities}
                onAct={state.act}
                onMessage={state.announce}
                profile={activeServer?.profile}
                project={project}
              />
            </div>
          ) : null}

          {view === "secrets" && capabilities?.secrets ? (
            <div className="absolute inset-0 animate-[fade-in_220ms_ease-out]">
              <Secrets />
            </div>
          ) : null}

          {view === "settings" && servers ? (
            <div className="absolute inset-0 animate-[fade-in_220ms_ease-out]">
              <Settings
                capabilities={capabilities}
                config={servers}
                onSave={state.saveServers}
              />
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
                <div className="grid h-full place-items-center bg-base text-ink-4">
                  No terminal open
                </div>
              ) : (
                <TerminalTabs
                  active={activeTerminal}
                  kind="shell"
                  onActivate={state.activateTerminal}
                  onClose={state.closeTerminal}
                  onNew={() => state.openTerminal(null, "shell")}
                  onRename={state.renameTerminal}
                  project={null}
                  sessions={serverTerminals}
                  states={state.terminalStates}
                />
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
