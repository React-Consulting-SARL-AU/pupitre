import { InstallProgress } from "@renderer/components/install/install-progress";
import { Callout } from "@renderer/components/ui/callout";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { LiveDuration } from "@renderer/components/ui/live-duration";
import { WaitingLine } from "@renderer/components/ui/waiting-line";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { ModuleProgress } from "@renderer/lib/module-progress";
import type { ApplyState } from "@renderer/stores/services";

/**
 * What an apply says of itself under the form: the wait, the agent's steps,
 * its refusal, and the verdict once it is over.
 */
export function ServiceConfigOutcome({
  apply,
  steps,
  name,
  nameOf,
  secretsDropped,
}: {
  apply: ApplyState;
  steps: readonly ModuleProgress[];
  name: string;
  nameOf: (moduleId: string) => string;
  /** A refusal took the typed secrets with it: they have to be typed again. */
  secretsDropped: boolean;
}) {
  const t = useTranslations();

  const running = apply.status === "running";
  const failed = apply.status === "done" ? apply.result.failed : [];

  return (
    <>
      {running ? (
        <WaitingLine className="text-small">
          <span>{t("services.config.applying", { name })}</span>
          <LiveDuration className="font-data tabular-nums" />
        </WaitingLine>
      ) : null}

      {running || apply.status === "done" ? (
        <InstallProgress modules={steps} nameOf={nameOf} />
      ) : null}

      {apply.status === "failed" ? <ErrorNotice error={apply.error} /> : null}

      {secretsDropped ? (
        <Callout name="secrets-dropped" tone="warn">
          {t("services.config.secretsDropped")}
        </Callout>
      ) : null}

      {apply.status === "done" ? (
        <Callout tone={failed.length > 0 ? "danger" : "ok"}>
          {failed.length > 0
            ? t("services.config.failed", { name })
            : t("services.config.done", { name })}
        </Callout>
      ) : null}
    </>
  );
}
