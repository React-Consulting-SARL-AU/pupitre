import type { Project } from "@pupitre/shared/agent-protocol/state";
import { ConfirmButton } from "@renderer/components/ui/confirm-button";
import { Label } from "@renderer/components/ui/label";
import { useTranslations } from "@renderer/i18n/use-translations";
import { memory, uptime } from "@renderer/lib/format";
import { isRunning } from "@renderer/lib/project-state";
import type { BranchState, EnvState, GitState } from "@renderer/stores/project";
import {
  GitBranch,
  KeyRound,
  MemoryStick,
  Terminal,
  Timer,
  Trash2,
} from "lucide-react";
import { useEffect } from "react";
import { ProjectAddresses } from "./project-addresses";
import { ProjectBranches } from "./project-branches";
import { ProjectEnv } from "./project-env";
import { ProjectGitState } from "./project-git-state";
import { ProjectPanel } from "./project-panel";

const HEAVY_MB = 2048;

/**
 * Everything about a project that is not a stream: its address, its branch, its
 * commands, what it weighs.
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
  onCheckout,
  onCheckGit,
  onSync,
  onReadEnv,
  onRegenerateEnv,
  onConfigure,
  onRemove,
}: {
  project: Project;
  git: GitState;
  branches: BranchState;
  env: EnvState;
  switching: boolean;
  syncing: boolean;
  onCheckout: (branch: string) => void;
  onCheckGit: () => void;
  /** Pull, then reinstall: what the header's Sync does, offered where the lead is read. */
  onSync: () => void;
  onReadEnv: () => void;
  onRegenerateEnv: () => Promise<void>;
  /** Opens the configuration tab, where the ports and their names live. */
  onConfigure: () => void;
  onRemove: () => void;
}) {
  const t = useTranslations();

  // The keys are read on arrival: the agent answers what it holds, and writes
  // the file only when the project has a template and no file yet.
  useEffect(() => {
    onReadEnv();
  }, [onReadEnv]);

  return (
    <div className="h-full overflow-y-auto px-8 py-6">
      <div className="grid gap-gutter md:grid-cols-2">
        <ProjectAddresses onPublish={onConfigure} project={project} />

        <ProjectPanel icon={GitBranch} label={t("project.overview.branch")}>
          <div className="flex flex-col gap-2.5">
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
          </div>
        </ProjectPanel>

        <ProjectPanel icon={KeyRound} label={t("project.overview.env")}>
          <ProjectEnv
            onRead={onReadEnv}
            onRegenerate={onRegenerateEnv}
            state={env}
          />
        </ProjectPanel>

        <ProjectPanel icon={Timer} label={t("project.overview.activity")}>
          <p className="font-semibold text-ink text-lg tabular-nums">
            {uptime(project.uptime_s)}
          </p>
          <p className="font-data text-[12px] text-ink-3">
            {isRunning(project.state)
              ? t("project.overview.running")
              : t("project.overview.stopped")}
            {project.pid ? ` · pid ${project.pid}` : ""}
          </p>
        </ProjectPanel>

        <ProjectPanel icon={Terminal} label={t("project.overview.commands")}>
          <Label>{t("project.overview.startCmd")}</Label>
          <p className="break-all font-data text-[12px] text-ink-2">
            {project.cmd}
          </p>
          <p className="mt-2">
            <Label>{t("project.overview.installCmd")}</Label>
          </p>
          <p className="break-all font-data text-[12px] text-ink-2">
            {project.install ||
              t("project.overview.derivedFrom", { pkgmgr: project.pkgmgr })}
          </p>
        </ProjectPanel>

        <ProjectPanel icon={MemoryStick} label={t("project.overview.memory")}>
          <p
            className={`font-semibold text-lg tabular-nums ${(project.ram_mb ?? 0) > HEAVY_MB ? "text-warn" : ""}`}
          >
            {memory(project.ram_mb)}
          </p>
          <p className="truncate font-data text-[12px] text-ink-3">
            {project.dir}
            {project.repo ? ` · ${project.repo}` : ""}
          </p>
        </ProjectPanel>
      </div>

      <div className="mt-6 flex justify-end border-line border-t pt-5">
        <ConfirmButton
          confirmLabel={t("project.overview.remove")}
          icon={Trash2}
          onConfirm={onRemove}
          question={t("project.overview.removeQuestion")}
          size="sm"
        >
          {t("project.overview.removeFromRegistry")}
        </ConfirmButton>
      </div>
    </div>
  );
}
