import type { Project } from "@pupitre/shared/agent-protocol/state";
import { ConfirmButton } from "@renderer/components/ui/confirm-button";
import { IconButton } from "@renderer/components/ui/icon-button";
import { Label } from "@renderer/components/ui/label";
import { memory, uptime } from "@renderer/lib/format";
import { isRunning } from "@renderer/lib/project-state";
import type { BranchState, GitState } from "@renderer/stores/project";
import {
  Check,
  Copy,
  ExternalLink,
  GitBranch,
  MemoryStick,
  Terminal,
  Timer,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { ProjectBranches } from "./project-branches";
import { ProjectGitState } from "./project-git-state";
import { ProjectPanel } from "./project-panel";

const COPY_MS = 1600;

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
  switching,
  onCheckout,
  onCheckGit,
  onRemove,
}: {
  project: Project;
  git: GitState;
  branches: BranchState;
  switching: boolean;
  onCheckout: (branch: string) => void;
  onCheckGit: () => void;
  onRemove: () => void;
}) {
  const [copied, setCopied] = useState(false);

  function copyAddress(url: string) {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), COPY_MS);
  }

  return (
    <div className="h-full overflow-y-auto px-6 py-5">
      <div className="grid gap-3 md:grid-cols-2">
        <ProjectPanel icon={ExternalLink} label="Adresse publique">
          {project.url ? (
            <div className="flex items-center gap-2">
              <button
                className="min-w-0 flex-1 truncate text-left font-data text-[12px] text-ink hover:underline"
                onClick={() => window.pupitre.openUrl(project.url ?? "")}
                type="button"
              >
                {project.url.replace("https://", "")}
              </button>
              <IconButton
                icon={copied ? Check : Copy}
                label={copied ? "Adresse copiée" : "Copier l'adresse"}
                onClick={() => copyAddress(project.url ?? "")}
              />
            </div>
          ) : (
            <span className="text-ink-4">Non publié</span>
          )}
          <p className="mt-2 font-data text-[11px] text-ink-3">
            local · {project.host}:{project.port}
          </p>
        </ProjectPanel>

        <ProjectPanel icon={GitBranch} label="Branche">
          <div className="flex flex-col gap-2.5">
            <ProjectBranches
              folder={project.dir}
              onCheckout={onCheckout}
              state={branches}
              switching={switching}
            />
            <ProjectGitState onCheck={onCheckGit} state={git} />
          </div>
        </ProjectPanel>

        <ProjectPanel icon={Timer} label="Activité">
          <p className="font-semibold text-ink text-lg tabular-nums">
            {uptime(project.uptime_s)}
          </p>
          <p className="font-data text-[11px] text-ink-3">
            {isRunning(project.state) ? "en cours" : "arrêté"}
            {project.pid ? ` · pid ${project.pid}` : ""}
          </p>
        </ProjectPanel>

        <ProjectPanel icon={Terminal} label="Commandes">
          <Label>démarrage</Label>
          <p className="break-all font-data text-[11px] text-ink-2">
            {project.cmd}
          </p>
          <p className="mt-2">
            <Label>installation</Label>
          </p>
          <p className="break-all font-data text-[11px] text-ink-2">
            {project.install || `dérivée de ${project.pkgmgr}`}
          </p>
        </ProjectPanel>

        <ProjectPanel icon={MemoryStick} label="Mémoire">
          <p
            className={`font-semibold text-lg tabular-nums ${(project.ram_mb ?? 0) > HEAVY_MB ? "text-warn" : ""}`}
          >
            {memory(project.ram_mb)}
          </p>
          <p className="truncate font-data text-[11px] text-ink-3">
            {project.dir}
            {project.repo ? ` · ${project.repo}` : ""}
          </p>
        </ProjectPanel>
      </div>

      <div className="mt-6 flex justify-end border-line border-t pt-5">
        <ConfirmButton
          confirmLabel="Retirer"
          icon={Trash2}
          onConfirm={onRemove}
          question="Le projet quitte le registre ; son dossier reste sur le serveur."
          size="sm"
        >
          Retirer du registre
        </ConfirmButton>
      </div>
    </div>
  );
}
