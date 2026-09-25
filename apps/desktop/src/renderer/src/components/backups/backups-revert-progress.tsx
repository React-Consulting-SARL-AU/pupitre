import { InstallProgress } from "@renderer/components/install/install-progress";
import { Button } from "@renderer/components/ui/button";
import { Dialog } from "@renderer/components/ui/dialog";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { WaitingNotice } from "@renderer/components/ui/waiting-notice";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { ModuleProgress } from "@renderer/lib/module-progress";
import { phasesAt } from "@renderer/lib/waiting-phases";
import type { RevertPhase, RevertState } from "@renderer/stores/backups";
import { X } from "lucide-react";
import { BackupsExtraChoice } from "./backups-extra-choice";
import { BackupsRestoreResult } from "./backups-restore-result";

/**
 * A revert as it runs, held over the whole window: nothing else can be touched
 * while the server's configuration and data are replaced. It says which phase,
 * what the agent reports of it, where it stopped and why in the agent's own
 * words, and what came back at the end — and only then lets go.
 */
export function BackupsRevertProgress({
  revert,
  phases,
  steps,
  installing,
  named,
  nameOf,
  onSettle,
  onDismiss,
}: {
  revert: Exclude<RevertState, { status: "idle" | "refused" }>;
  /** The phases this revert walks: the save only when it was asked for, the extra modules only when there are some. */
  phases: readonly RevertPhase[];
  /** What the agent reported of the save or of the data. */
  steps: readonly ModuleProgress[];
  /** The modules the install is putting back. */
  installing: readonly ModuleProgress[];
  /** The backup as the sentences name it: its name if it has one, and its date. */
  named: string;
  nameOf: (moduleId: string) => string;
  onSettle: (uninstall: readonly string[]) => Promise<void>;
  onDismiss: () => void;
}) {
  const t = useTranslations();

  const label = (id: RevertPhase) => t(`backups.revert.phase.${id}`);
  const at =
    revert.status === "running" || revert.status === "failed"
      ? revert.phase
      : null;
  const atInstall = at === "install";
  const saving = at === "save";
  const finished = revert.status === "failed" || revert.status === "done";

  return (
    <Dialog
      actions={
        finished ? (
          <Button icon={X} onClick={onDismiss} variant="discreet">
            {t("backups.revert.dismiss")}
          </Button>
        ) : null
      }
      locked={!finished}
      name="backup-revert-progress"
      onClose={onDismiss}
      open
      title={t("backups.revert.progressTitle", { backup: named })}
      width="large"
    >
      {revert.status === "running" ? (
        <WaitingNotice
          phases={phasesAt(phases, revert.phase, label)}
          title={label(revert.phase)}
        />
      ) : null}

      {revert.status === "choosing" ? (
        <BackupsExtraChoice
          extra={revert.extra}
          nameOf={nameOf}
          onSettle={onSettle}
        />
      ) : null}

      {revert.status === "failed" ? (
        <>
          <p className="text-ink-3 text-small">
            {t("backups.revert.stoppedAt", { phase: label(revert.phase) })}
          </p>
          <ErrorNotice error={revert.error} />
        </>
      ) : null}

      {revert.status === "done" ? (
        <BackupsRestoreResult
          headline={t("backups.revert.done", { backup: named })}
          result={revert.result}
        />
      ) : null}

      {atInstall ? (
        <InstallProgress modules={installing} nameOf={nameOf} />
      ) : null}

      {!atInstall && revert.status !== "choosing" && steps.length > 0 ? (
        <InstallProgress
          modules={steps}
          nameOf={nameOf}
          wording={saving ? "backup" : "restore"}
        />
      ) : null}
    </Dialog>
  );
}
