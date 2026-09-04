import type {
  Branches,
  Capabilities,
  Project,
  Registration,
  TerminalKind,
} from "@shared/contract";
import type { ServerProfile } from "@shared/profile";
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  FileDiff,
  FolderCode,
  GitBranch,
  GitBranchPlus,
  LayoutGrid,
  MemoryStick,
  Play,
  RotateCw,
  ScrollText,
  Settings2,
  Square,
  SquareTerminal,
  Terminal,
  Timer,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { dominantState, group, useAppState } from "../stores/state";
import { AgentDot } from "./AgentDot";
import { DiffView } from "./DiffView";
import { ClaudeIcon, CodexIcon, type IconComponent } from "./Icons";
import { LogPanel } from "./LogPanel";
import { fieldsFrom, ProjectForm } from "./ProjectForm";
import { RepoState } from "./Repos";
import { StatusPill } from "./StatusPill";
import { TerminalTabs } from "./TerminalTabs";

type Tab = "overview" | "logs" | "diff" | TerminalKind;

const TABS: Tab[] = [
  "overview",
  "logs",
  "diff",
  "shell",
  "claude",
  "codex",
  "tui",
];

/** What comes back from storage is a string, and last ran another version. */
function isTab(value: string | undefined): value is Tab {
  return value !== undefined && (TABS as string[]).includes(value);
}

const KIND_LABEL: Record<string, string> = {
  shell: "Terminal",
  claude: "Claude",
  codex: "Codex",
};

const KIND_ICON: Record<string, IconComponent> = {
  shell: SquareTerminal,
  claude: ClaudeIcon,
  codex: CodexIcon,
};

function memory(mb: number): string {
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(1)} GB`;
  }
  return mb > 0 ? `${mb} MB` : "—";
}

function Panel({
  icon: Icon,
  label,
  children,
}: {
  icon: IconComponent;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center gap-2 text-ink-4">
        <Icon size={13} strokeWidth={2} />
        <span className="font-mono text-[10px] uppercase tracking-[0.09em]">
          {label}
        </span>
      </div>
      <div className="mt-2.5">{children}</div>
    </div>
  );
}

type Props = {
  project: Project;
  busy: boolean;
  /** Null until the machine has answered: we then only show what is certain. */
  capabilities: Capabilities | null;
  /** How this particular server opens in an editor. Absent: no button. */
  profile?: ServerProfile;
  onAct: (action: "up" | "down" | "restart", project: string) => void;
  onMessage: (text: string) => void;
};

export function ProjectView({
  project,
  busy,
  capabilities,
  profile,
  onAct,
  onMessage,
}: Props) {
  const terminals = useAppState((s) => s.terminals);
  const activeTabs = useAppState((s) => s.activeTabs);
  const terminalStates = useAppState((s) => s.terminalStates);
  const ensureTerminal = useAppState((s) => s.ensureTerminal);
  const openTerminal = useAppState((s) => s.openTerminal);
  const closeTerminal = useAppState((s) => s.closeTerminal);
  const activateTerminal = useAppState((s) => s.activateTerminal);
  const renameTerminal = useAppState((s) => s.renameTerminal);

  const projectTabs = useAppState((st) => st.projectTabs);
  const setProjectTab = useAppState((st) => st.setProjectTab);

  const [tab, setTabState] = useState<Tab>("overview");

  /**
   * Switching tabs also writes it down, so coming back to this project reopens
   * the tab you left it on. Every caller goes through here — a `setTabState`
   * left somewhere would be a tab that silently stops being remembered.
   */
  const setTab = useCallback(
    (next: Tab) => {
      setTabState(next);
      setProjectTab(project.name, next);
    },
    [project.name, setProjectTab]
  );
  const [registration, setRegistration] = useState<Registration | null>(null);
  const [configuring, setConfiguring] = useState(false);
  const [branches, setBranches] = useState<Branches | null>(null);
  const [switching, setSwitching] = useState(false);
  const [copied, setCopied] = useState(false);

  const hasRegistry = capabilities?.registry !== false;
  const status = useAppState((s) => s.git[project.name] ?? null);
  const gitBusy = useAppState((s) => s.gitBusy);
  const refreshGit = useAppState((s) => s.refreshGit);
  const pull = useAppState((s) => s.pull);

  useEffect(() => {
    setBranches(null);
    // The tab this project was last read on, not "overview": that is the whole
    // point of remembering it. `setTabState` and not `setTab` — restoring is not
    // a choice the user just made, and writing it back would be noise.
    const remembered = projectTabs[project.name];
    setTabState(isTab(remembered) ? remembered : "overview");
    setConfiguring(false);
    setRegistration(null);
    window.pupitre.branches(project.name).then(setBranches);
    // No network: the full repository sweep runs on its own, here we settle for
    // what the server already knows about this one.
    refreshGit(false, [project.name]);
    if (!hasRegistry) {
      return;
    }
    // The registry is only read when the project opens: it does not move on its
    // own, and re-reading it on every poll would cost one more round trip.
    window.pupitre
      .projects()
      .then((all) =>
        setRegistration(all.find((i) => i.name === project.name) ?? null)
      );
    // projectTabs is deliberately absent: this restores on arriving at a
    // project, and re-running it every time a tab is remembered would drag the
    // view back to where it was.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.name, hasRegistry, refreshGit]);

  useEffect(() => {
    if (tab === "shell" || tab === "claude" || tab === "codex") {
      ensureTerminal(project.name, tab);
    }
  }, [tab, project.name, ensureTerminal]);

  /**
   * A remembered tab the project no longer offers falls back to the overview.
   *
   * The machine may have changed since: an agent uninstalled, a folder that is
   * no longer a repository. Without this, the remembered tab would show an empty
   * panel with no matching button to click out of.
   *
   * `capabilities` is null until the server answers — we wait for it, otherwise
   * every launch would bounce an agent tab back to the overview.
   */
  useEffect(() => {
    if (!capabilities) {
      return;
    }
    const gone =
      ((tab === "claude" || tab === "codex") &&
        !capabilities.agents.includes(tab)) ||
      (tab === "logs" && capabilities.logs === false) ||
      (tab === "diff" && status?.repo === false);
    if (gone) {
      setTabState("overview");
    }
  }, [capabilities, tab, status?.repo]);

  // Agent tabs only show for what is installed over there: opening "Claude" on a
  // machine that does not have it just gives a terminal that dies at once.
  const kinds: TerminalKind[] = ["shell", ...(capabilities?.agents ?? [])];
  const hasLogs = capabilities?.logs !== false;

  const running =
    project.state === "online" ||
    project.state === "service" ||
    project.state === "external";

  async function switchBranch(target: string) {
    if (target === branches?.current) {
      return;
    }
    setSwitching(true);
    const res = await window.pupitre.switchBranch(project.name, target);
    setSwitching(false);
    if (res.ok) {
      setBranches(await window.pupitre.branches(project.name));
      // The branch we just took has its own lead: the one we were looking at
      // says nothing about it any more, and this is the moment you want to know
      // whether there is anything to pull before restarting.
      await refreshGit(true, [project.name]);
    } else {
      onMessage(res.message);
    }
  }

  function copyUrl() {
    navigator.clipboard.writeText(project.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  const allBranches = branches
    ? [
        ...branches.local,
        ...branches.remote.filter((r) => !branches.local.includes(r)),
      ]
    : [];

  return (
    <div className="flex h-full flex-col">
      <header className="shrink-0 border-line border-b px-6 pt-5 pb-0">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-semibold text-lg tracking-tight">
            {project.name}
          </h1>
          <StatusPill state={project.state} />
          {/*
            The branch and the number of changes, right next to the state: that
            is the question you actually arrive with — is what runs the code I
            think it is? Clicking goes to the diff.
          */}
          {status?.repo ? (
            <button
              className="flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5 font-mono text-[10px] text-ink-3 transition-soft hover:border-accent hover:text-accent-strong"
              onClick={() => setTab("diff")}
              title="See the changed files"
              type="button"
            >
              <GitBranch size={10} />
              <span className="max-w-[14rem] truncate">{status.current}</span>
              {status.changed > 0 ? (
                <span className="text-warn">
                  {status.changed} change{status.changed > 1 ? "s" : ""}
                </span>
              ) : (
                <span className="text-ok">clean</span>
              )}
              {status.behind > 0 ? (
                <span className="text-accent-strong">↓{status.behind}</span>
              ) : null}
              {status.ahead > 0 ? (
                <span className="text-ink-4">↑{status.ahead}</span>
              ) : null}
            </button>
          ) : null}

          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <Action
              disabled={busy}
              icon={running ? RotateCw : Play}
              onClick={() => onAct(running ? "restart" : "up", project.name)}
              primary
            >
              {running ? "Restart" : "Start"}
            </Action>
            {running ? (
              <Action
                disabled={busy}
                icon={Square}
                onClick={() => onAct("down", project.name)}
              >
                Stop
              </Action>
            ) : null}
            {profile?.editor ? (
              <Action
                icon={FolderCode}
                onClick={() => window.pupitre.openEditor(project.dir)}
              >
                {profile.editorName}
              </Action>
            ) : null}
            <Action
              disabled={!registration}
              icon={Settings2}
              onClick={() => {
                setTab("overview");
                setConfiguring((v) => !v);
              }}
            >
              Configure
            </Action>
          </div>
        </div>

        <div className="mt-4 flex gap-1 overflow-x-auto">
          <TabButton
            active={tab === "overview"}
            icon={LayoutGrid}
            onClick={() => setTab("overview")}
          >
            Overview
          </TabButton>
          {hasLogs ? (
            <TabButton
              active={tab === "logs"}
              icon={ScrollText}
              onClick={() => setTab("logs")}
            >
              Log
            </TabButton>
          ) : null}
          {/*
            Only for a versioned project: on a plain folder the tab would open
            on "not a repository", which is a tab that teaches nothing.
          */}
          {status?.repo === false ? null : (
            <TabButton
              active={tab === "diff"}
              icon={FileDiff}
              onClick={() => setTab("diff")}
            >
              Diff
              {status && status.changed > 0 ? (
                <span className="rounded-full bg-sunken px-1.5 font-mono text-[10px] text-ink-4">
                  {status.changed}
                </span>
              ) : null}
            </TabButton>
          )}
          {kinds.map((kind) => {
            const sessions = group(terminals, project.name, kind);
            return (
              <TabButton
                active={tab === kind}
                icon={KIND_ICON[kind]}
                key={kind}
                onClick={() => setTab(kind)}
              >
                {KIND_LABEL[kind] ?? kind}
                {sessions.length > 1 ? (
                  <span className="rounded-full bg-sunken px-1.5 font-mono text-[10px] text-ink-4">
                    {sessions.length}
                  </span>
                ) : null}
                <AgentDot state={dominantState(sessions, terminalStates)} />
              </TabButton>
            );
          })}
        </div>
      </header>

      <div className="min-h-0 flex-1">
        {tab === "shell" || tab === "claude" || tab === "codex" ? (
          <TerminalTabs
            active={activeTabs[`${project.name}:${tab}`] ?? null}
            kind={tab}
            onActivate={activateTerminal}
            onClose={closeTerminal}
            onNew={() => openTerminal(project.name, tab)}
            onRename={renameTerminal}
            project={project.name}
            sessions={group(terminals, project.name, tab)}
            states={terminalStates}
          />
        ) : tab === "logs" ? (
          <LogPanel project={project.name} />
        ) : tab === "diff" ? (
          <DiffView
            onRead={() => refreshGit(false, [project.name])}
            project={project.name}
          />
        ) : (
          <div className="h-full animate-[fade-in_200ms_ease-out] overflow-y-auto px-6 py-5">
            {configuring && registration ? (
              <div className="mb-4">
                <ProjectForm
                  derivedInstall={registration.install_effective}
                  initial={fieldsFrom(registration)}
                  onCancel={() => setConfiguring(false)}
                  onSaved={async () => {
                    setConfiguring(false);
                    const all = await window.pupitre.projects();
                    setRegistration(
                      all.find((i) => i.name === project.name) ?? null
                    );
                  }}
                  origin={registration.origin}
                />
              </div>
            ) : null}

            <div className="grid gap-3 md:grid-cols-2">
              <Panel icon={ExternalLink} label="Public address">
                {project.url ? (
                  <div className="flex items-center gap-2">
                    <button
                      className="min-w-0 flex-1 truncate text-left font-mono text-[12px] text-accent-strong hover:underline"
                      onClick={() => window.pupitre.openUrl(project.url)}
                      type="button"
                    >
                      {project.url.replace("https://", "")}
                    </button>
                    <button
                      aria-label="Copy the address"
                      className="shrink-0 rounded-md border border-line p-1.5 text-ink-4 transition-soft hover:border-accent hover:text-accent-strong"
                      onClick={copyUrl}
                      type="button"
                    >
                      {copied ? <Check size={13} /> : <Copy size={13} />}
                    </button>
                  </div>
                ) : (
                  <span className="text-ink-4">Not published</span>
                )}
                <p className="mt-2 font-mono text-[11px] text-ink-4">
                  local · {project.host}:{project.port}
                </p>
              </Panel>

              <Panel icon={GitBranch} label="Branch">
                {branches && !branches.repo ? (
                  <div className="flex items-start gap-2 text-ink-4">
                    <GitBranchPlus className="mt-px shrink-0" size={13} />
                    <div className="min-w-0">
                      <p className="text-[12px] text-ink-3">
                        No git repository
                      </p>
                      <p className="mt-0.5 font-mono text-[11px]">
                        {project.dir} is not versioned
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <select
                      className="w-full rounded-md border border-line bg-base px-2.5 py-1.5 font-mono text-[12px] outline-none focus:border-accent disabled:opacity-50"
                      disabled={switching || !branches}
                      onChange={(e) => switchBranch(e.target.value)}
                      value={branches?.current ?? ""}
                    >
                      {branches ? null : <option>loading…</option>}
                      {allBranches.map((b) => (
                        <option key={b} value={b}>
                          {b}
                          {branches?.local.includes(b) ? "" : "  (remote)"}
                        </option>
                      ))}
                    </select>
                    {branches?.dirty ? (
                      <p className="mt-2 flex items-center gap-1.5 text-[11px] text-warn">
                        <AlertTriangle size={12} />
                        uncommitted changes — the switch will be refused
                      </p>
                    ) : (
                      <p className="mt-2 truncate font-mono text-[11px] text-ink-4">
                        {branches?.root} · {branches?.local.length ?? 0} local
                      </p>
                    )}

                    <RepoState
                      busy={gitBusy}
                      busyProject={busy}
                      onCheck={() => refreshGit(true, [project.name])}
                      onPull={() => pull(project.name)}
                      status={status}
                    />
                  </>
                )}
              </Panel>

              <Panel icon={Timer} label="Activity">
                <p className="font-semibold text-lg tabular-nums">
                  {project.uptime || "—"}
                </p>
                <p className="font-mono text-[11px] text-ink-4">
                  {running ? "running" : "stopped"}
                </p>
              </Panel>

              {/*
                How the project starts and how its dependencies get installed.
                Both come from the registry, and both are shown: "it used pnpm"
                is not an answer to "what did it run".
              */}
              {registration ? (
                <Panel icon={Terminal} label="Commands">
                  <p className="font-mono text-[10px] text-ink-4 uppercase tracking-[0.08em]">
                    start
                  </p>
                  <p className="break-all font-mono text-[11px] text-ink-2">
                    {registration.command || "—"}
                  </p>
                  <p className="mt-2 font-mono text-[10px] text-ink-4 uppercase tracking-[0.08em]">
                    install
                    {registration.install &&
                    registration.install !== "-" ? null : (
                      <span className="ml-1 normal-case tracking-normal">
                        (derived from {registration.package_manager})
                      </span>
                    )}
                  </p>
                  <p className="break-all font-mono text-[11px] text-ink-2">
                    {registration.install_effective || "—"}
                  </p>
                </Panel>
              ) : null}

              <Panel icon={MemoryStick} label="Memory">
                <p
                  className={`font-semibold text-lg tabular-nums ${project.ram_mb > 2048 ? "text-warn" : ""}`}
                >
                  {memory(project.ram_mb)}
                </p>
                <p className="truncate font-mono text-[11px] text-ink-4">
                  {project.dir}
                </p>
              </Panel>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Action icon={SquareTerminal} onClick={() => setTab("shell")}>
                Open a terminal
              </Action>
              {hasLogs ? (
                <Action icon={ScrollText} onClick={() => setTab("logs")}>
                  View the log
                </Action>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TabButton({
  children,
  active,
  onClick,
  icon: Icon,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  icon?: IconComponent;
}) {
  return (
    <button
      className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-[12px] transition-colors ${
        active
          ? "border-accent font-medium text-accent-strong"
          : "border-transparent text-ink-3 hover:text-ink"
      }`}
      onClick={onClick}
      type="button"
    >
      {Icon ? <Icon size={13} /> : null}
      {children}
    </button>
  );
}

function Action({
  children,
  onClick,
  disabled,
  icon: Icon,
  primary,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  icon: IconComponent;
  primary?: boolean;
}) {
  return (
    <button
      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] transition-soft disabled:opacity-40 ${
        primary
          ? "bg-accent font-medium text-base hover:bg-accent-strong"
          : "border border-line-strong hover:border-accent hover:text-accent-strong"
      }`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <Icon size={13} strokeWidth={2} />
      {children}
    </button>
  );
}
