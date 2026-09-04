import type {
  AgentState,
  Capabilities,
  Project,
  ServersConfig,
  Terminal,
} from "@shared/contract";
import {
  KeyRound,
  LayoutDashboard,
  Plus,
  Server,
  Settings as SettingsIcon,
  SquareTerminal,
  X,
} from "lucide-react";
import { dominantState, type View } from "../stores/state";
import { AgentDot } from "./AgentDot";
import { Logo } from "./Logo";
import { IconButton } from "./ui/icon-button";
import { Label } from "./ui/label";
import { StatusDot, type StatusShape, type StatusTone } from "./ui/status-dot";

/** The same shapes as the pills, small enough to sit in front of a name. */
const DOT: Record<string, { shape: StatusShape; tone: StatusTone }> = {
  online: { shape: "filled", tone: "ok" },
  service: { shape: "filled", tone: "ok" },
  external: { shape: "filled", tone: "ok" },
  starting: { shape: "breathing", tone: "warn" },
  failed: { shape: "struck", tone: "danger" },
  down: { shape: "struck", tone: "danger" },
  stopped: { shape: "empty", tone: "neutral" },
};

const UNKNOWN_DOT = { shape: "empty", tone: "neutral" } as const;

/**
 * Processes from the same repository are grouped together.
 *
 * A repository with only one does not deserve a header: that would be one more
 * line saying the same thing twice.
 */
function groupByRepo(projects: Project[]): [string, Project[]][] {
  const buckets = new Map<string, Project[]>();
  for (const project of projects) {
    const members = buckets.get(project.group) ?? [];
    members.push(project);
    buckets.set(project.group, members);
  }
  return [...buckets.entries()];
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 pt-4 pb-1.5">
      <Label>{children}</Label>
    </p>
  );
}

function Entry({
  active,
  onClick,
  children,
  bullet,
  beforeSuffix,
  suffix,
  indented,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  bullet?: React.ReactNode;
  beforeSuffix?: React.ReactNode;
  suffix?: React.ReactNode;
  indented?: boolean;
}) {
  return (
    <div
      className={`group flex w-full items-center gap-2 rounded-sm pr-1.5 transition-soft ${
        active ? "bg-raised" : "hover:bg-sunken"
      }`}
    >
      <button
        className={`flex min-w-0 flex-1 items-center gap-2 py-[7px] pr-1 text-left text-[12px] transition-soft ${
          indented ? "pl-6" : "pl-3"
        } ${active ? "font-medium text-ink" : "text-ink-2 group-hover:text-ink"}`}
        onClick={onClick}
        type="button"
      >
        {bullet}
        <span className="min-w-0 flex-1 truncate">{children}</span>
      </button>
      {beforeSuffix}
      {suffix}
    </div>
  );
}

type Props = {
  view: View;
  /** Null until the machine has answered: we then only show what is certain. */
  capabilities: Capabilities | null;
  projects: Project[];
  selection: string | null;
  terminals: Terminal[];
  /** Every session, to flag agents of a project that is not open. */
  allTerminals: Terminal[];
  states: Record<string, AgentState>;
  activeTerminal: string | null;
  servers: ServersConfig | null;
  onView: (view: View) => void;
  onProject: (name: string) => void;
  onTerminal: (id: string) => void;
  onCloseTerminal: (id: string) => void;
  onNewTerminal: () => void;
};

export function Sidebar({
  view,
  capabilities,
  projects,
  selection,
  terminals,
  allTerminals,
  states,
  activeTerminal,
  servers,
  onView,
  onProject,
  onTerminal,
  onCloseTerminal,
  onNewTerminal,
}: Props) {
  const activeServer = servers?.servers.find((s) => s.id === servers.active);

  return (
    <nav className="flex h-full flex-col overflow-y-auto border-line border-r bg-base pb-4">
      <div className="draggable flex h-10 shrink-0 items-center justify-end px-3">
        <Logo size={17} />
      </div>

      <button
        className="clickable mx-2 mb-1 flex items-center gap-2 rounded-sm border border-line px-3 py-2 text-left transition-soft hover:border-line-strong hover:bg-surface"
        onClick={() => onView("settings")}
        type="button"
      >
        <Server className="shrink-0 text-ink-3" size={15} strokeWidth={1.5} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-[12px]">
            {activeServer?.name ?? "Server"}
          </span>
          <span className="block truncate font-data text-[10px] text-ink-3">
            {activeServer?.host ?? "—"}
          </span>
        </span>
      </button>

      <div className="px-2">
        <Entry
          active={view === "dashboard"}
          bullet={<LayoutDashboard size={14} strokeWidth={1.5} />}
          onClick={() => onView("dashboard")}
        >
          Dashboard
        </Entry>
      </div>

      <Heading>Projects</Heading>
      <div className="flex flex-col gap-px px-2">
        {groupByRepo(projects).map(([groupName, members]) => (
          <div key={groupName}>
            {members.length > 1 ? (
              <p className="truncate px-3 pt-2 pb-0.5 font-data text-[10px] text-ink-3">
                {groupName}
              </p>
            ) : null}
            {members.map((project) => (
              <Entry
                active={view === "project" && selection === project.name}
                beforeSuffix={
                  <AgentDot
                    state={dominantState(
                      allTerminals.filter(
                        (t) =>
                          t.project === project.name &&
                          (t.kind === "claude" || t.kind === "codex")
                      ),
                      states
                    )}
                  />
                }
                bullet={
                  <StatusDot
                    label={project.state}
                    shape={(DOT[project.state] ?? UNKNOWN_DOT).shape}
                    size={9}
                    tone={(DOT[project.state] ?? UNKNOWN_DOT).tone}
                  />
                }
                indented={members.length > 1}
                key={project.name}
                onClick={() => onProject(project.name)}
                suffix={
                  project.ram_mb > 0 ? (
                    <span className="shrink-0 font-data text-[10px] text-ink-3 tabular-nums">
                      {project.ram_mb >= 1024
                        ? `${(project.ram_mb / 1024).toFixed(1)}G`
                        : `${project.ram_mb}M`}
                    </span>
                  ) : null
                }
              >
                {members.length > 1
                  ? (project.name.replace(`${groupName}-`, "") ?? project.name)
                  : project.name}
              </Entry>
            ))}
          </div>
        ))}
      </div>

      <Heading>Server terminals</Heading>
      <div className="flex flex-col gap-px px-2">
        {terminals.map((terminal) => (
          <Entry
            active={view === "terminals" && activeTerminal === terminal.id}
            beforeSuffix={<AgentDot state={states[terminal.id]} />}
            bullet={
              <SquareTerminal
                className="shrink-0"
                size={13}
                strokeWidth={1.5}
              />
            }
            key={terminal.id}
            onClick={() => onTerminal(terminal.id)}
            suffix={
              <IconButton
                className="opacity-0 transition-soft focus-visible:opacity-100 group-hover:opacity-100"
                icon={X}
                label={`Close ${terminal.title}`}
                onClick={() => onCloseTerminal(terminal.id)}
                size={12}
                variant="danger"
              />
            }
          >
            {terminal.title}
          </Entry>
        ))}
        <button
          className="mt-0.5 flex items-center gap-2 rounded-sm px-3 py-[7px] text-left text-[12px] text-ink-3 transition-soft hover:bg-sunken hover:text-ink"
          onClick={onNewTerminal}
          type="button"
        >
          <Plus size={13} strokeWidth={1.5} />
          New terminal
        </button>
      </div>

      <div className="mt-auto flex flex-col gap-px px-2 pt-4">
        {capabilities?.secrets ? (
          <Entry
            active={view === "secrets"}
            bullet={<KeyRound size={14} strokeWidth={1.5} />}
            onClick={() => onView("secrets")}
          >
            Secrets
          </Entry>
        ) : null}
        <Entry
          active={view === "settings"}
          bullet={<SettingsIcon size={14} strokeWidth={1.5} />}
          onClick={() => onView("settings")}
        >
          Settings
        </Entry>
      </div>
    </nav>
  );
}
