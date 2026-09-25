import type { Project } from "@pupitre/shared/agent-protocol/state";
import { Button } from "@renderer/components/ui/button";
import { Panel } from "@renderer/components/ui/panel";
import { ServiceLogo } from "@renderer/components/ui/service-logo";
import { StatePill } from "@renderer/components/ui/state-pill";
import { useTranslations } from "@renderer/i18n/use-translations";
import { memory, uptime } from "@renderer/lib/format";
import { runtimeModuleOf } from "@renderer/lib/modules";
import { liveAddresses } from "@renderer/lib/project-addresses";
import { memoryOf } from "@renderer/lib/project-ports";
import {
  isRunning,
  PROCESS_LOOK,
  PROJECT_LOOK,
} from "@renderer/lib/project-state";
import type { Gesture } from "@renderer/lib/use-pending";
import type { ProjectAction } from "@renderer/stores/snapshot";
import { Package, Play, RotateCw, Square } from "lucide-react";
import { DashboardProjectOpen } from "./dashboard-project-open";

// The gap with the remote lives on the project page: it costs a network round trip per project.
export function DashboardProjectCard({
  project,
  busy,
  onOpen,
  onAct,
}: {
  project: Project;
  busy: boolean;
  onOpen: (name: string) => void;
  onAct: Gesture<[ProjectAction, string]>;
}) {
  const t = useTranslations();

  const running = isRunning(project.state);
  const main = project.processes[0];
  const several = project.processes.length > 1;
  const published = main?.routes.find((route) => route.hostname)?.hostname;
  const ram = memoryOf(project);
  const age = Math.max(
    ...project.processes.map((process) => process.uptime_s ?? 0)
  );
  const usage = [age ? uptime(age) : null, ram ? memory(ram) : null]
    .filter(Boolean)
    .join(" · ");

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
          <p className="mt-0.5 truncate font-data text-caption text-ink-3">
            {several
              ? project.processes
                  .map((process) => `${process.id}:${process.port}`)
                  .join(" · ")
              : (published ?? `${main?.host}:${main?.port}`)}
            {project.branch ? ` · ${project.branch}` : ""}
          </p>
        </button>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <StatePill look={PROJECT_LOOK[project.state]} name={project.state} />
          {usage ? (
            <span className="font-data text-caption text-ink-3 tabular-nums">
              {usage}
            </span>
          ) : null}
        </div>
      </div>

      {several ? (
        <ul className="mt-3 flex flex-wrap gap-1.5" data-processes>
          {project.processes.map((process) => (
            <li
              className="flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5 font-data text-caption text-ink-3"
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
        <DashboardProjectOpen addresses={liveAddresses(project)} />
      </div>
    </Panel>
  );
}
