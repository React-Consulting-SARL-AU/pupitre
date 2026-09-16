import type { Project } from "@pupitre/shared/agent-protocol/state";
import { Button } from "@renderer/components/ui/button";
import { Panel } from "@renderer/components/ui/panel";
import { ServiceLogo } from "@renderer/components/ui/service-logo";
import { StatePill } from "@renderer/components/ui/state-pill";
import { useTranslations } from "@renderer/i18n/use-translations";
import { memory, uptime } from "@renderer/lib/format";
import { runtimeModuleOf } from "@renderer/lib/modules";
import { memoryOf } from "@renderer/lib/project-ports";
import {
  isRunning,
  PROCESS_LOOK,
  PROJECT_LOOK,
} from "@renderer/lib/project-state";
import { publicUrl } from "@renderer/lib/public-url";
import type { ProjectAction } from "@renderer/stores/snapshot";
import { ExternalLink, Package, Play, RotateCw, Square } from "lucide-react";

/**
 * One project, and the three things you do to it from here.
 *
 * Everything shown comes from the snapshot: the state, the ports, the branch,
 * the memory. A project of several processes shows one pill per process, so
 * a server up and a client down read as what they are. The gap with the
 * remote repository does not — it costs a network round trip per project —
 * and lives on the project's own page.
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
  const address = publicUrl(project.url);

  const running = isRunning(project.state);
  const main = project.processes[0];
  const several = project.processes.length > 1;
  const ram = memoryOf(project);
  const age = Math.max(
    ...project.processes.map((process) => process.uptime_s ?? 0)
  );

  return (
    <Panel as="article" className="transition-soft">
      <div className="flex items-start justify-between gap-3">
        <ServiceLogo
          fallback={Package}
          moduleId={runtimeModuleOf(main?.pkgmgr ?? "none")}
          name={main?.pkgmgr ?? "none"}
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
          <p className="mt-0.5 truncate font-data text-[11px] text-ink-3">
            {several
              ? project.processes
                  .map((process) => `${process.id}:${process.port}`)
                  .join(" · ")
              : `${main?.host}:${main?.port}`}
            {project.branch ? ` · ${project.branch}` : ""}
          </p>
        </button>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <StatePill look={PROJECT_LOOK[project.state]} name={project.state} />
          <span className="font-data text-[11px] text-ink-3 tabular-nums">
            {uptime(age || undefined)}
            {ram ? ` · ${memory(ram)}` : ""}
          </span>
        </div>
      </div>

      {several ? (
        <ul className="mt-3 flex flex-wrap gap-1.5" data-processes>
          {project.processes.map((process) => (
            <li
              className="flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5 font-data text-[11px] text-ink-3"
              data-process={process.id}
              key={process.id}
            >
              <span className="text-ink">{process.id}</span>
              <StatePill
                look={PROCESS_LOOK[process.state]}
                name={process.state}
              />
            </li>
          ))}
        </ul>
      ) : null}

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
        {address ? (
          <Button
            icon={ExternalLink}
            onClick={() => window.pupitre.openUrl(address)}
            size="sm"
          >
            {t("dashboard.card.open")}
          </Button>
        ) : null}
      </div>
    </Panel>
  );
}
