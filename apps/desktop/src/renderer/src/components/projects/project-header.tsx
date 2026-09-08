import type { ProjectGitStatusResult } from "@pupitre/shared/agent-protocol/projects";
import type { Project } from "@pupitre/shared/agent-protocol/state";
import { Button } from "@renderer/components/ui/button";
import { ServiceLogo } from "@renderer/components/ui/service-logo";
import { StatePill } from "@renderer/components/ui/state-pill";
import { useTranslations } from "@renderer/i18n/use-translations";
import { runtimeModuleOf } from "@renderer/lib/modules";
import { isRunning, PROJECT_LOOK } from "@renderer/lib/project-state";
import type { ProjectAction } from "@renderer/stores/snapshot";
import {
  GitBranch,
  Package,
  Play,
  RefreshCw,
  RotateCw,
  Square,
} from "lucide-react";
import type { ReactNode } from "react";

/**
 * The name, the state, the branch, and what you do next.
 *
 * The branch button carries the answer to the question you actually arrive
 * with — is what runs the code I think it is — and clicking it goes to the diff.
 */
export function ProjectHeader({
  project,
  git,
  busy,
  syncing,
  onAct,
  onSync,
  onSeeDiff,
  editors,
  children,
}: {
  project: Project;
  /** Absent while the network read is in flight, or when it failed. */
  git: ProjectGitStatusResult | null;
  busy: boolean;
  syncing: boolean;
  onAct: (action: ProjectAction, name: string) => void;
  onSync: () => void;
  onSeeDiff: () => void;
  editors: ReactNode;
  /** The tab bar, so the header owns its own bottom edge. */
  children: ReactNode;
}) {
  const t = useTranslations();

  const running = isRunning(project.state);

  return (
    <header className="shrink-0 border-line border-b bg-surface px-8 pt-6 pb-0">
      <div className="flex flex-wrap items-center gap-3">
        <ServiceLogo
          fallback={Package}
          moduleId={runtimeModuleOf(project.pkgmgr)}
          name={project.pkgmgr}
          size={20}
        />
        <h1 className="font-bold font-display text-ink text-xl tracking-tight">
          {project.name}
        </h1>
        <StatePill look={PROJECT_LOOK[project.state]} name={project.state} />

        {git?.repo ? (
          <button
            className="flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5 font-data text-[11px] text-ink-3 tabular-nums transition-soft hover:border-line-strong hover:text-ink"
            onClick={onSeeDiff}
            title={t("project.header.seeDiff")}
            type="button"
          >
            <GitBranch size={10} strokeWidth={1.5} />
            <span className="max-w-[14rem] truncate">{git.current}</span>
            {git.changed > 0 ? (
              <span className="text-warn">
                {t.plural("project.change", git.changed)}
              </span>
            ) : (
              <span className="text-ok">{t("project.clean")}</span>
            )}
            {git.behind > 0 ? (
              <span className="font-semibold text-ink">↓{git.behind}</span>
            ) : null}
            {git.ahead > 0 ? (
              <span className="text-ink-3">↑{git.ahead}</span>
            ) : null}
          </button>
        ) : null}

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Button
            disabled={busy}
            icon={running ? RotateCw : Play}
            onClick={() =>
              onAct(running ? "project.restart" : "project.up", project.name)
            }
            variant="inverse"
          >
            {running ? t("project.header.restart") : t("project.header.start")}
          </Button>
          {running ? (
            <Button
              disabled={busy}
              icon={Square}
              onClick={() => onAct("project.down", project.name)}
            >
              {t("project.header.stop")}
            </Button>
          ) : null}
          <Button
            icon={RefreshCw}
            loading={syncing}
            onClick={onSync}
            title={t("project.header.syncHint")}
          >
            {t("project.header.sync")}
          </Button>
          {editors}
        </div>
      </div>

      {children}
    </header>
  );
}
