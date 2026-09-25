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
  busy: boolean;
  onAct: Gesture<[ProjectAction, string]>;
  onCheckout: (branch: string) => Promise<void>;
  onCheckGit: () => void;
  onSync: () => void;
  onReadEnv: () => void;
  onRegenerateEnv: () => Promise<void>;
  onConfigure: () => void;
}) {
  const t = useTranslations();

  // Reading may write the env file, but only when a template exists and the file does not.
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
            <span className="truncate font-data text-ink-3 text-small">
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
