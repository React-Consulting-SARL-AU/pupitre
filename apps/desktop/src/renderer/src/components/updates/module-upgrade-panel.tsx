import { InstallProgress } from "@renderer/components/install/install-progress";
import { Button } from "@renderer/components/ui/button";
import { Callout } from "@renderer/components/ui/callout";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { Section } from "@renderer/components/ui/section";
import { StatusDot } from "@renderer/components/ui/status-dot";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { ModuleProgress } from "@renderer/lib/module-progress";
import type { ModulesState } from "@renderer/stores/agent-update";
import { RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

export function ModuleUpgradePanel({
  modules,
  state,
  steps,
  nameOf,
  onUpgrade,
  children,
}: {
  modules: readonly string[];
  state: ModulesState;
  steps: readonly ModuleProgress[];
  nameOf: (moduleId: string) => string;
  onUpgrade: () => void;
  children?: ReactNode;
}) {
  const t = useTranslations();

  const result = state.status === "done" ? state.result : null;

  return (
    <Section
      actions={
        modules.length > 0 ? (
          <Button
            icon={RefreshCw}
            loading={state.status === "running"}
            onClick={onUpgrade}
            size="sm"
          >
            {t("updates.modules.upgradeAll")}
          </Button>
        ) : null
      }
      aside={
        modules.length > 0 ? (
          <span className="font-data text-ink-3 text-small">
            {t.plural("updates.modules.count", modules.length)}
          </span>
        ) : null
      }
      data-module-upgrade=""
      name="installed"
      title={t("updates.modules.title")}
    >
      {children}

      {steps.length > 0 ? (
        <InstallProgress modules={steps} nameOf={nameOf} />
      ) : null}

      {state.status === "failed" ? (
        <ErrorNotice error={state.error} onRetry={onUpgrade} />
      ) : null}

      {result ? (
        <div className="flex flex-col gap-1.5">
          {result.failed.map((moduleId) => (
            <p
              className="flex items-center gap-2 text-ink-2"
              data-failed={moduleId}
              key={moduleId}
            >
              <StatusDot shape="struck" size={10} tone="danger" />
              {t("updates.modules.failed", { name: nameOf(moduleId) })}
            </p>
          ))}

          {result.warned.map((moduleId) => (
            <p
              className="flex items-center gap-2 text-ink-2"
              data-warned={moduleId}
              key={moduleId}
            >
              <StatusDot shape="ringed" size={10} tone="warn" />
              {t("updates.modules.warned", { name: nameOf(moduleId) })}
            </p>
          ))}

          <Callout fix={result.report_path}>
            {t("updates.modules.report", {
              failed: result.failed.length,
              warned: result.warned.length,
            })}
          </Callout>
        </div>
      ) : null}
    </Section>
  );
}
