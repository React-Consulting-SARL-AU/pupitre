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

/**
 * `upgrade` on the modules already installed, on the machine's own list.
 *
 * The section frames that list: the gesture that replays the install of
 * everything on it stands on its caption, and what the replay says lands under
 * the rows. The agent replays the install steps of what it put there; the app
 * names none of them itself — the list comes from the snapshot, and the report
 * comes back in the same shape an installation does.
 */
export function ModuleUpgradePanel({
  modules,
  state,
  steps,
  nameOf,
  onUpgrade,
  children,
}: {
  /** The installed module ids, as the snapshot listed them. */
  modules: readonly string[];
  state: ModulesState;
  steps: readonly ModuleProgress[];
  nameOf: (moduleId: string) => string;
  onUpgrade: () => void;
  /** The rows of the installed modules. */
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
          <span className="font-data text-[12px] text-ink-3">
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
