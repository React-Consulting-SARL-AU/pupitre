import type { Project } from "@pupitre/shared/agent-protocol/state";
import { Button } from "@renderer/components/ui/button";
import { StatePill } from "@renderer/components/ui/state-pill";
import { memory, uptime } from "@renderer/lib/format";
import { isRunning, PROJECT_LOOK } from "@renderer/lib/project-state";
import type { ProjectAction } from "@renderer/stores/snapshot";
import { ExternalLink, Play, RotateCw, Square } from "lucide-react";

/**
 * One project, and the three things you do to it from here.
 *
 * Everything shown comes from the snapshot: the state, the port, the branch,
 * the memory. The gap with the remote repository does not — it costs a network
 * round trip per project — and lives on the project's own page.
 */
export function DashboardProjectCard({
  project,
  busy,
  onOpen,
  onAct,
}: {
  project: Project;
  busy: boolean;
  onOpen: (name: string) => void;
  onAct: (action: ProjectAction, name: string) => void;
}) {
  const running = isRunning(project.state);

  return (
    <article className="elevation-raised rounded-md bg-surface p-4 transition-soft">
      <div className="flex items-start justify-between gap-3">
        <button
          className="min-w-0 text-left"
          onClick={() => onOpen(project.name)}
          type="button"
        >
          <p className="truncate font-semibold text-ink hover:underline">
            {project.name}
          </p>
          <p className="mt-0.5 truncate font-data text-[10px] text-ink-3">
            {project.host}:{project.port}
            {project.branch ? ` · ${project.branch}` : ""}
          </p>
        </button>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <StatePill look={PROJECT_LOOK[project.state]} name={project.state} />
          <span className="font-data text-[10px] text-ink-3 tabular-nums">
            {uptime(project.uptime_s)}
            {project.ram_mb ? ` · ${memory(project.ram_mb)}` : ""}
          </span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Button
          disabled={busy}
          icon={running ? RotateCw : Play}
          onClick={() =>
            onAct(running ? "project.restart" : "project.up", project.name)
          }
          size="sm"
        >
          {running ? "Redémarrer" : "Démarrer"}
        </Button>
        {running ? (
          <Button
            disabled={busy}
            icon={Square}
            onClick={() => onAct("project.down", project.name)}
            size="sm"
          >
            Arrêter
          </Button>
        ) : null}
        {project.url ? (
          <Button
            icon={ExternalLink}
            onClick={() => window.pupitre.openUrl(project.url ?? "")}
            size="sm"
          >
            Ouvrir
          </Button>
        ) : null}
      </div>
    </article>
  );
}
