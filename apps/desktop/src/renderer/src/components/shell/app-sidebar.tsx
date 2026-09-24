import type { Project } from "@pupitre/shared/agent-protocol/state";
import { Logo } from "@renderer/components/logo";
import { AgentDot } from "@renderer/components/ui/agent-dot";
import { IconButton } from "@renderer/components/ui/icon-button";
import { StatusDot } from "@renderer/components/ui/status-dot";
import { WindowBand } from "@renderer/components/ui/window-band";
import { useTranslations } from "@renderer/i18n/use-translations";
import { memory } from "@renderer/lib/format";
import { memoryOf } from "@renderer/lib/project-ports";
import { PROJECT_LOOK } from "@renderer/lib/project-state";
import type { View } from "@renderer/stores/navigation";
import { dominantState } from "@renderer/stores/navigation";
import type { Server } from "@shared/servers";
import type { AgentState, Terminal } from "@shared/terminals";
import {
  Activity,
  Boxes,
  CircleHelp,
  DatabaseBackup,
  Files,
  FolderPlus,
  Images,
  LayoutDashboard,
  Plus,
  Settings as SettingsIcon,
  SquareTerminal,
  X,
} from "lucide-react";
import { ForwardsPanel } from "./forwards-panel";
import { ServerSwitch } from "./server-switch";
import { SidebarEntry } from "./sidebar-entry";
import { SidebarGroup } from "./sidebar-group";
import { TransfersPanel } from "./transfers-panel";

/**
 * The three planes of the menu: the group caption, the entries, the active one.
 *
 * Everything listed here comes from the snapshot the agent just answered — the
 * projects, their states, their memory. The app adds the terminals it opened
 * itself, and nothing else.
 */

interface Props {
  view: View;
  server: Server | null;
  /** Every server this computer knows, for the switch at the head. */
  servers: readonly Server[];
  onSwitchServer: (id: string) => void;
  projects: readonly Project[];
  selection: string | null;
  /** The server's own terminals; a project's live on its page. */
  terminals: readonly Terminal[];
  /** Every session, to flag the agents of a project that is not open. */
  allTerminals: readonly Terminal[];
  states: Record<string, AgentState>;
  activeTerminal: string | null;
  onView: (view: View) => void;
  onProject: (name: string) => void;
  onAddProject: () => void;
  onTerminal: (id: string) => void;
  onCloseTerminal: (id: string) => void;
  onNewTerminal: () => void;
}

export function AppSidebar({
  view,
  server,
  servers,
  onSwitchServer,
  projects,
  selection,
  terminals,
  allTerminals,
  states,
  activeTerminal,
  onView,
  onProject,
  onAddProject,
  onTerminal,
  onCloseTerminal,
  onNewTerminal,
}: Props) {
  const t = useTranslations();

  return (
    <nav className="flex h-full flex-col overflow-y-auto border-line border-r bg-surface pb-4">
      <WindowBand className="justify-end px-3">
        <Logo size={17} />
      </WindowBand>

      <ServerSwitch
        onActivate={onSwitchServer}
        onSettings={() => onView("settings")}
        server={server}
        servers={servers}
      />

      <SidebarGroup title={t("shell.sidebar.server")}>
        <SidebarEntry
          active={view === "dashboard"}
          bullet={<LayoutDashboard size={14} strokeWidth={1.5} />}
          onClick={() => onView("dashboard")}
        >
          {t("shell.sidebar.dashboard")}
        </SidebarEntry>
        <SidebarEntry
          active={view === "services"}
          bullet={<Boxes size={14} strokeWidth={1.5} />}
          onClick={() => onView("services")}
        >
          {t("shell.sidebar.services")}
        </SidebarEntry>
        <SidebarEntry
          active={view === "activity"}
          bullet={<Activity size={14} strokeWidth={1.5} />}
          onClick={() => onView("activity")}
        >
          {t("shell.sidebar.activity")}
        </SidebarEntry>
        <SidebarEntry
          active={view === "shots"}
          bullet={<Images size={14} strokeWidth={1.5} />}
          onClick={() => onView("shots")}
        >
          {t("shell.sidebar.gallery")}
        </SidebarEntry>
        <SidebarEntry
          active={view === "files"}
          bullet={<Files size={14} strokeWidth={1.5} />}
          onClick={() => onView("files")}
        >
          {t("shell.sidebar.files")}
        </SidebarEntry>
        <SidebarEntry
          active={view === "backups"}
          bullet={<DatabaseBackup size={14} strokeWidth={1.5} />}
          onClick={() => onView("backups")}
        >
          {t("shell.sidebar.backups")}
        </SidebarEntry>
      </SidebarGroup>

      <SidebarGroup
        action={
          <IconButton
            icon={FolderPlus}
            label={t("shell.sidebar.newProject")}
            onClick={onAddProject}
            size={12}
            variant="discreet"
          />
        }
        title={t("shell.sidebar.projects")}
      >
        {projects.length === 0 ? (
          <p className="px-3 py-2 text-[12px] text-ink-3 leading-relaxed">
            {t("shell.sidebar.noProjects")}
          </p>
        ) : null}
        {projects.map((project) => (
          <SidebarEntry
            active={view === "project" && selection === project.name}
            beforeSuffix={
              <AgentDot
                state={dominantState(
                  allTerminals.filter(
                    (t) => t.project === project.name && t.kind !== "shell"
                  ),
                  states
                )}
              />
            }
            bullet={
              <StatusDot
                label={t(PROJECT_LOOK[project.state].label)}
                shape={PROJECT_LOOK[project.state].shape}
                size={9}
                tone={PROJECT_LOOK[project.state].tone}
              />
            }
            key={project.name}
            onClick={() => onProject(project.name)}
            suffix={
              memoryOf(project) ? (
                <span className="shrink-0 font-data text-[11px] text-ink-3 tabular-nums">
                  {memory(memoryOf(project))}
                </span>
              ) : null
            }
          >
            {project.name}
          </SidebarEntry>
        ))}
      </SidebarGroup>

      <SidebarGroup
        action={
          <IconButton
            icon={Plus}
            label={t("shell.sidebar.newTerminal")}
            onClick={onNewTerminal}
            size={12}
            variant="discreet"
          />
        }
        title={t("shell.sidebar.terminals")}
      >
        {terminals.map((terminal) => (
          <SidebarEntry
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
                label={t("shell.sidebar.closeTerminal", {
                  title: terminal.title,
                })}
                onClick={() => onCloseTerminal(terminal.id)}
                size={12}
                variant="danger"
              />
            }
          >
            {terminal.title}
          </SidebarEntry>
        ))}
      </SidebarGroup>

      <div className="mt-auto flex flex-col pt-6">
        <TransfersPanel />
        <ForwardsPanel />

        <div className="flex flex-col gap-0.5 px-2 pt-4">
          <SidebarEntry
            active={view === "help"}
            bullet={<CircleHelp size={14} strokeWidth={1.5} />}
            onClick={() => onView("help")}
          >
            {t("shell.sidebar.help")}
          </SidebarEntry>
          <SidebarEntry
            active={view === "settings"}
            bullet={<SettingsIcon size={14} strokeWidth={1.5} />}
            onClick={() => onView("settings")}
          >
            {t("shell.sidebar.settings")}
          </SidebarEntry>
        </div>
      </div>
    </nav>
  );
}
