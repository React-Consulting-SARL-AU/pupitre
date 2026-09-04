import type { Project } from "@pupitre/shared/agent-protocol/state";
import { Button } from "@renderer/components/ui/button";
import { ServiceLogo } from "@renderer/components/ui/service-logo";
import { StatePill } from "@renderer/components/ui/state-pill";
import { useTranslations } from "@renderer/i18n/use-translations";
import { memory, uptime } from "@renderer/lib/format";
import { runtimeModuleOf } from "@renderer/lib/modules";
import { isRunning, PROJECT_LOOK } from "@renderer/lib/project-state";
import type { ProjectAction } from "@renderer/stores/snapshot";
import { ExternalLink, Package, Play, RotateCw, Square } from "lucide-react";

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
  const t = useTranslations();

  const running = isRunning(project.state);

  return (
    <article className="elevation-raised rounded-md border border-line bg-surface p-4 transition-soft">
      <div className="flex items-start justify-between gap-3">
        <ServiceLogo
          fallback={Package}
          moduleId={runtimeModuleOf(project.pkgmgr)}
          name={project.pkgmgr}
          size={20}
        />

        <button
          className="min-w-0 flex-1 text-left"
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
          {running ? t("dashboard.card.restart") : t("dashboard.card.start")}
        </Button>
        {running ? (
          <Button
            disabled={busy}
            icon={Square}
            onClick={() => onAct("project.down", project.name)}
            size="sm"
          >
            {t("dashboard.card.stop")}
          </Button>
        ) : null}
        {project.url ? (
          <Button
            icon={ExternalLink}
            onClick={() => window.pupitre.openUrl(project.url ?? "")}
            size="sm"
          >
            {t("dashboard.card.open")}
          </Button>
        ) : null}
      </div>
    </article>
  );
}
