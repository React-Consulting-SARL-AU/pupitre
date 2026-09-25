import { Button } from "@renderer/components/ui/button";
import { GateScreen } from "@renderer/components/ui/gate-screen";
import { useTranslations } from "@renderer/i18n/use-translations";
import { riseAt } from "@renderer/lib/motion";
import { Plus, Settings as SettingsIcon } from "lucide-react";

const STEPS = ["inspect", "install", "harden"] as const;

export function FirstRunScreen({
  onAddServer,
  onSettings,
}: {
  onAddServer: () => void;
  onSettings: () => void;
}) {
  const t = useTranslations();

  return (
    <GateScreen
      actions={
        <>
          <Button icon={Plus} onClick={onAddServer} variant="inverse">
            {t("shell.firstRun.addServer")}
          </Button>
          <Button icon={SettingsIcon} onClick={onSettings} variant="discreet">
            {t("shell.firstRun.settings")}
          </Button>
        </>
      }
      actionsAt={3 + STEPS.length}
      eyebrow={t("shell.firstRun.eyebrow")}
      lead={t("shell.firstRun.body")}
      title={t("shell.firstRun.title")}
    >
      <ol className="flex flex-col">
        {STEPS.map((step, index) => (
          <li className="rise flex gap-4" key={step} style={riseAt(3 + index)}>
            <div className="flex flex-col items-center self-stretch">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-line-strong font-data text-ink-2 text-small tabular-nums">
                {index + 1}
              </span>
              {index === STEPS.length - 1 ? null : (
                <span className="w-px flex-1 bg-line" />
              )}
            </div>

            <div className="min-w-0 pb-6">
              <p className="font-medium text-ink">
                {t(`shell.firstRun.step.${step}.title`)}
              </p>
              <p className="mt-1 text-ink-3 leading-relaxed">
                {t(`shell.firstRun.step.${step}.detail`)}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </GateScreen>
  );
}
