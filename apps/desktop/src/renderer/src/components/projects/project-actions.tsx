import type { Project } from "@pupitre/shared/agent-protocol/state";
import { Button } from "@renderer/components/ui/button";
import { useTranslations } from "@renderer/i18n/use-translations";
import { isRunning } from "@renderer/lib/project-state";
import type { ProjectAction } from "@renderer/stores/snapshot";
import { Play, RefreshCw, RotateCw, Square } from "lucide-react";
import type { ReactNode } from "react";

/** What you do next with the project: run it, sync it, open it. */
export function ProjectActions({
  project,
  busy,
  syncing,
  onAct,
  onSync,
  editors,
}: {
  project: Project;
  busy: boolean;
  syncing: boolean;
  onAct: (action: ProjectAction, name: string) => void;
  onSync: () => void;
  editors: ReactNode;
}) {
  const t = useTranslations();

  const running = isRunning(project.state);

  return (
    <>
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
    </>
  );
}
