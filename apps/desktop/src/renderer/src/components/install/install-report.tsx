import type { InstallResult } from "@pupitre/shared/agent-protocol/install";
import { useTranslations } from "@renderer/i18n/use-translations";
import { RotateCcw } from "lucide-react";
import { stepLabel } from "../../lib/step-label";
import type { ModuleProgress, StepEntry } from "../../stores/install";
import { Button } from "../ui/button";
import { Details } from "../ui/details";
import { Panel } from "../ui/panel";
import { StatusDot } from "../ui/status-dot";

/**
 * What the agent concluded, and what can still be done about it.
 *
 * `failed` and `warned` are its own lists, printed in its own order. A module
 * that failed says so in plain words, says what it means for the reader, and
 * keeps the agent's own line and the repair command under Details; its button
 * runs `install` again for it alone. The way out is the bar the screen ends on.
 */
export function InstallReport({
  result,
  modules,
  nameOf,
  onReplay,
  replaying,
}: {
  result: InstallResult;
  modules: readonly ModuleProgress[];
  nameOf: (moduleId: string) => string;
  onReplay?: (moduleId: string) => Promise<void> | void;
  replaying?: string | null;
}) {
  const t = useTranslations();

  function warningsOf(moduleId: string): string[] {
    return (
      modules
        .find((module) => module.id === moduleId)
        ?.steps.filter((step) => step.status !== "fail" && step.message)
        .map((step) => step.message as string) ?? []
    );
  }

  function failedStepOf(moduleId: string): StepEntry | undefined {
    const steps = modules.find((module) => module.id === moduleId)?.steps;

    return (
      steps?.find((step) => step.status === "fail") ??
      steps?.find((step) => step.replay)
    );
  }

  return (
    <section className="flex flex-col gap-gutter">
      {result.failed.length > 0 ? (
        <ul className="flex flex-col gap-gutter">
          {result.failed.map((moduleId) => {
            const step = failedStepOf(moduleId);

            return (
              <Panel
                as="li"
                className="flex flex-wrap items-start gap-3"
                data-failed={moduleId}
                inset="sm"
                key={moduleId}
              >
                <span className="translate-y-1">
                  <StatusDot shape="struck" size={10} tone="danger" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-ink">
                    {t("install.failed", { name: nameOf(moduleId) })}
                  </p>
                  {step ? (
                    <p className="mt-0.5 text-ink-3 text-small leading-relaxed">
                      {t("install.failedAt", { step: stepLabel(t, step.step) })}
                    </p>
                  ) : null}
                  {step?.message || step?.replay ? (
                    <Details className="mt-1">
                      {step.message ? (
                        <span className="block font-data">
                          {step.step} : {step.message}
                        </span>
                      ) : null}
                      {step.replay ? (
                        <code className="mt-1 block break-all font-data text-ink-3">
                          {step.replay}
                        </code>
                      ) : null}
                    </Details>
                  ) : null}
                </div>
                <Button
                  icon={RotateCcw}
                  loading={replaying === moduleId}
                  onClick={() => onReplay?.(moduleId)}
                >
                  {t("install.replay")}
                </Button>
              </Panel>
            );
          })}
        </ul>
      ) : null}

      {result.warned.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {result.warned.map((moduleId) => (
            <li
              className="flex items-start gap-2 text-ink-2"
              data-warned={moduleId}
              key={moduleId}
            >
              <span className="translate-y-1">
                <StatusDot shape="ringed" size={10} tone="warn" />
              </span>
              <span className="flex min-w-0 flex-col">
                <span>{t("install.warned", { name: nameOf(moduleId) })}</span>
                {warningsOf(moduleId).map((warning) => (
                  <span
                    className="text-ink-3 text-small leading-relaxed"
                    key={warning}
                  >
                    {warning}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {result.failed.length === 0 && result.warned.length === 0 ? (
        <p className="flex items-center gap-2 text-ink" data-all-done="true">
          <StatusDot shape="filled" size={10} tone="ok" />
          {t("install.allDone")}
        </p>
      ) : null}

      <Details>
        <span className="break-all font-data">{result.report_path}</span>
      </Details>
    </section>
  );
}
