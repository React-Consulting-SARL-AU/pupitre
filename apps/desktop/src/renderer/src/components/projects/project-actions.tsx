import type { Project } from "@pupitre/shared/agent-protocol/state";
import { Button } from "@renderer/components/ui/button";
import { ConfirmButton } from "@renderer/components/ui/confirm-button";
import { useTranslations } from "@renderer/i18n/use-translations";
import { isRunning } from "@renderer/lib/project-state";
import type { ProjectAction } from "@renderer/stores/snapshot";
import { Play, RefreshCw, RotateCw, Square, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

/**
 * What you do with the whole project: run it, sync it, let it go — and, on a
 * line of their own under those, open it in an editor of this computer.
 */
export function ProjectActions({
  project,
  busy,
  syncing,
  onAct,
  onSync,
  onRemove,
  editors,
}: {
  project: Project;
  busy: boolean;
  syncing: boolean;
  onAct: (action: ProjectAction, name: string) => void;
  onSync: () => void;
  /** Answer with the promise of the removal and the button waits on it. */
  onRemove: () => Promise<void>;
  editors: ReactNode;
}) {
  const t = useTranslations();

  const running = isRunning(project.state);

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
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
          hint={t("project.header.syncHint")}
          icon={RefreshCw}
          loading={syncing}
          onClick={onSync}
        >
          {t("project.header.sync")}
        </Button>
        <ConfirmButton
          confirmLabel={t("project.overview.remove")}
          icon={Trash2}
          onConfirm={onRemove}
          question={t("project.overview.removeQuestion")}
        >
          {t("project.overview.removeFromRegistry")}
        </ConfirmButton>
      </div>
      {editors}
    </div>
  );
}
