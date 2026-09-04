import type { Project } from "@pupitre/shared/agent-protocol/state";
import { Logo } from "@renderer/components/logo";
import { AgentDot } from "@renderer/components/ui/agent-dot";
import { IconButton } from "@renderer/components/ui/icon-button";
import { StatusDot } from "@renderer/components/ui/status-dot";
import { memory } from "@renderer/lib/format";
import { PROJECT_LOOK } from "@renderer/lib/project-state";
import type { View } from "@renderer/stores/navigation";
import { dominantState } from "@renderer/stores/navigation";
import type { Server } from "@shared/servers";
import type { AgentState, Terminal } from "@shared/terminals";
import {
  Activity,
  Boxes,
  KeyRound,
  LayoutDashboard,
  Plus,
  Server as ServerIcon,
  Settings as SettingsIcon,
  SquareTerminal,
  X,
} from "lucide-react";
import { SidebarEntry } from "./sidebar-entry";
import { SidebarGroup } from "./sidebar-group";

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
  onTerminal: (id: string) => void;
  onCloseTerminal: (id: string) => void;
  onNewTerminal: () => void;
}

export function AppSidebar({
  view,
  server,
  projects,
  selection,
  terminals,
  allTerminals,
  states,
  activeTerminal,
  onView,
  onProject,
  onTerminal,
  onCloseTerminal,
  onNewTerminal,
}: Props) {
  return (
    <nav className="flex h-full flex-col overflow-y-auto border-line border-r bg-surface pb-4">
      <div className="draggable flex h-10 shrink-0 items-center justify-end px-3">
        <Logo size={17} />
      </div>

      <button
        className="clickable mx-2 mb-1 flex items-center gap-2.5 rounded-md border border-line bg-base px-3 py-2.5 text-left transition-soft hover:border-line-strong hover:bg-raised"
        onClick={() => onView("settings")}
        type="button"
      >
        <ServerIcon
          className="shrink-0 text-ink-3"
          size={15}
          strokeWidth={1.5}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-[12px]">
            {server?.name ?? "Aucun serveur"}
          </span>
          <span className="block truncate font-data text-[10px] text-ink-3">
            {server?.host ?? "—"}
          </span>
        </span>
      </button>

      <SidebarGroup title="Serveur">
        <SidebarEntry
          active={view === "dashboard"}
          bullet={<LayoutDashboard size={14} strokeWidth={1.5} />}
          onClick={() => onView("dashboard")}
        >
          Tableau de bord
        </SidebarEntry>
        <SidebarEntry
          active={view === "services"}
          bullet={<Boxes size={14} strokeWidth={1.5} />}
          onClick={() => onView("services")}
        >
          Services
        </SidebarEntry>
        <SidebarEntry
          active={view === "activity"}
          bullet={<Activity size={14} strokeWidth={1.5} />}
          onClick={() => onView("activity")}
        >
          Processus et sessions
        </SidebarEntry>
        <SidebarEntry
          active={view === "secrets"}
          bullet={<KeyRound size={14} strokeWidth={1.5} />}
          onClick={() => onView("secrets")}
        >
          Secrets
        </SidebarEntry>
      </SidebarGroup>

      <SidebarGroup title="Projets">
        {projects.length === 0 ? (
          <p className="px-3 py-2 text-[11px] text-ink-4 leading-relaxed">
            Aucun projet déclaré.
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
                label={PROJECT_LOOK[project.state].label}
                shape={PROJECT_LOOK[project.state].shape}
                size={9}
                tone={PROJECT_LOOK[project.state].tone}
              />
            }
            key={project.name}
            onClick={() => onProject(project.name)}
            suffix={
              project.ram_mb ? (
                <span className="shrink-0 font-data text-[10px] text-ink-3 tabular-nums">
                  {memory(project.ram_mb)}
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
            label="Ouvrir un terminal sur le serveur"
            onClick={onNewTerminal}
            size={12}
            variant="discreet"
          />
        }
        title="Terminaux"
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
                label={`Fermer ${terminal.title}`}
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

      <div className="mt-auto flex flex-col gap-0.5 px-2 pt-6">
        <SidebarEntry
          active={view === "settings"}
          bullet={<SettingsIcon size={14} strokeWidth={1.5} />}
          onClick={() => onView("settings")}
        >
          Réglages
        </SidebarEntry>
      </div>
    </nav>
  );
}
