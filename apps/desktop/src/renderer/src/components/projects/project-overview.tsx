import type { Project } from "@pupitre/shared/agent-protocol/state";
import { Panel } from "@renderer/components/ui/panel";
import { Section } from "@renderer/components/ui/section";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { Gesture } from "@renderer/lib/use-pending";
import type { BranchState, EnvState, GitState } from "@renderer/stores/project";
import type { ProjectAction } from "@renderer/stores/snapshot";
import { useEffect } from "react";
import { ProjectAddresses } from "./project-addresses";
import { ProjectBranches } from "./project-branches";
import { ProjectEnv } from "./project-env";
import { ProjectGitState } from "./project-git-state";
import { ProjectProcessRow } from "./project-process-row";

/**
 * Everything about a project that is not a stream: its address, its branch, its
 * processes and what each of them runs on and weighs.
 *
 * All of it comes from the registry row the agent answered with; nothing here
 * is inferred, and a field the agent left empty shows as empty rather than as a
 * guess.
 */
export function ProjectOverview({
  project,
  git,
  branches,
  env,
  switching,
  syncing,
  busy,
  onAct,
  onCheckout,
  onCheckGit,
  onSync,
  onReadEnv,
  onRegenerateEnv,
  onConfigure,
}: {
  project: Project;
  git: GitState;
  branches: BranchState;
  env: EnvState;
  switching: boolean;
  syncing: boolean;
  /** A gesture on the project is in flight: the process buttons wait for it. */
  busy: boolean;
  /** Starts, stops or restarts one process of the project. */
  onAct: Gesture<[ProjectAction, string]>;
  onCheckout: (branch: string) => Promise<void>;
  onCheckGit: () => void;
  /** Pull, then reinstall: what the header's Sync does, offered where the lead is read. */
  onSync: () => void;
  onReadEnv: () => void;
  onRegenerateEnv: () => Promise<void>;
  /** Opens the configuration tab, where the ports and their names live. */
  onConfigure: () => void;
}) {
  const t = useTranslations();

  // The keys are read on arrival: the agent answers what it holds, and writes
  // the file only when the project has a template and no file yet.
  useEffect(() => {
    onReadEnv();
  }, [onReadEnv]);

  return (
    <div className="h-full overflow-y-auto px-8 py-6">
      <div className="grid gap-section md:grid-cols-2">
        <div className="flex flex-col gap-section">
          <ProjectAddresses onPublish={onConfigure} project={project} />

          <Section name="env" title={t("project.overview.env")}>
            <Panel>
              <ProjectEnv
                onRead={onReadEnv}
                onRegenerate={onRegenerateEnv}
                state={env}
              />
            </Panel>
          </Section>
        </div>

        <Section name="branch" title={t("project.overview.branch")}>
          <Panel className="flex flex-col gap-3">
            <ProjectBranches
              folder={project.dir}
              onCheckout={onCheckout}
              state={branches}
              switching={switching}
            />
            <ProjectGitState
              onCheck={onCheckGit}
              onPull={onSync}
              pulling={syncing}
              state={git}
            />
          </Panel>
        </Section>

        <Section
          aside={
            <span className="truncate font-data text-[12px] text-ink-3">
              {project.dir}
              {project.repo ? ` · ${project.repo}` : ""}
            </span>
          }
          className="md:col-span-2"
          name="processes"
          title={t("project.overview.processes")}
        >
          <Panel as="ul" data-processes={project.processes.length} list>
            {project.processes.map((process) => (
              <ProjectProcessRow
                busy={busy}
                key={process.id}
                onAct={onAct}
                process={process}
              />
            ))}
          </Panel>
        </Section>
      </div>
    </div>
  );
}
