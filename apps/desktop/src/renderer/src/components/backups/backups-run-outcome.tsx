import { InstallProgress } from "@renderer/components/install/install-progress";
import { Button } from "@renderer/components/ui/button";
import { Callout } from "@renderer/components/ui/callout";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { Section } from "@renderer/components/ui/section";
import { WaitingNotice } from "@renderer/components/ui/waiting-notice";
import { useTranslations } from "@renderer/i18n/use-translations";
import { weight } from "@renderer/lib/format";
import type { ModuleProgress } from "@renderer/lib/module-progress";
import type { RunState } from "@renderer/stores/backups";
import { X } from "lucide-react";

/** The backup asked for now: its steps as the agent runs them, then what it left in the bucket. */
export function BackupsRunOutcome({
  run,
  steps,
  nameOf,
  onRetry,
  onDismiss,
}: {
  run: Exclude<RunState, { status: "idle" }>;
  steps: readonly ModuleProgress[];
  nameOf: (moduleId: string) => string;
  onRetry: () => Promise<void>;
  onDismiss: () => void;
}) {
  const t = useTranslations();

  return (
    <Section
      actions={
        run.status === "running" ? undefined : (
          <Button icon={X} onClick={onDismiss} size="sm" variant="discreet">
            {t("backups.run.dismiss")}
          </Button>
        )
      }
      name="backup-run"
      title={t("backups.run.title")}
    >
      {run.status === "running" ? (
        <WaitingNotice title={t("backups.run.running")} />
      ) : null}

      {run.status === "failed" ? (
        <ErrorNotice error={run.error} onRetry={onRetry} />
      ) : null}

      {run.status === "done" ? (
        <>
          <Callout tone={run.result.warnings.length > 0 ? "warn" : "ok"}>
            {t("backups.run.done", { weight: weight(run.result.bytes) })}
          </Callout>
          {run.result.warnings.map((warning) => (
            <Callout key={warning} tone="warn">
              {warning}
            </Callout>
          ))}
          {run.result.declared ? null : (
            <Callout>{t("backups.run.undeclared")}</Callout>
          )}
        </>
      ) : null}

      {steps.length > 0 ? (
        <InstallProgress modules={steps} nameOf={nameOf} wording="backup" />
      ) : null}
    </Section>
  );
}
