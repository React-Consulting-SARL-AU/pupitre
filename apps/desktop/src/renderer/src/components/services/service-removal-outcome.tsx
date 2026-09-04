import { InstallProgress } from "@renderer/components/install/install-progress";
import { Button } from "@renderer/components/ui/button";
import { Callout } from "@renderer/components/ui/callout";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { ModuleProgress } from "@renderer/lib/module-progress";
import type { RemovalState } from "@renderer/stores/services";
import { ArrowLeft } from "lucide-react";

/**
 * A removal as it happens, drawn by the rows the installation already uses:
 * `uninstall` reports the same steps, and a reader who has seen one install
 * has already learnt to read this.
 */
export function ServiceRemovalOutcome({
  removal,
  steps,
  nameOf,
  onBack,
}: {
  removal: RemovalState;
  steps: readonly ModuleProgress[];
  nameOf: (moduleId: string) => string;
  onBack: () => void;
}) {
  const t = useTranslations();

  if (removal.status === "idle") {
    return null;
  }

  const failed = removal.status === "done" ? removal.failed : [];

  return (
    <section className="flex flex-col gap-gutter" data-removal={removal.status}>
      {steps.length > 0 ? (
        <InstallProgress modules={steps} nameOf={nameOf} />
      ) : null}

      {removal.status === "failed" ? (
        <ErrorNotice error={removal.error} />
      ) : null}

      {removal.status === "done" && failed.length > 0 ? (
        <Callout tone="danger">
          {t("services.removal.outcome.partial", {
            names: failed.map(nameOf).join(", "),
          })}
        </Callout>
      ) : null}

      {removal.status === "done" && failed.length === 0 ? (
        <Callout tone="info">
          {t("services.removal.outcome.done", {
            name: nameOf(removal.moduleId),
          })}
        </Callout>
      ) : null}

      {removal.status === "done" ? (
        <div>
          <Button icon={ArrowLeft} onClick={onBack} variant="inverse">
            {t("services.removal.outcome.back")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
