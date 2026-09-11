import { Logo } from "@renderer/components/logo";
import { Button } from "@renderer/components/ui/button";
import { Label } from "@renderer/components/ui/label";
import { WindowBand } from "@renderer/components/ui/window-band";
import { useTranslations } from "@renderer/i18n/use-translations";
import { riseAt } from "@renderer/lib/motion";
import { Plus, Settings as SettingsIcon } from "lucide-react";

/**
 * The app with an account and not one machine yet.
 *
 * It is the only screen that has nothing to report, so it is the only one that
 * may say what is about to happen: three steps, in the order the assistant runs
 * them, and the one button that starts them. Everything named here is what the
 * agent will do — nothing is promised that the next screens do not carry out.
 */

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
    <div className="relative grid h-full place-items-center overflow-y-auto bg-base px-8 py-12">
      <WindowBand className="absolute inset-x-0 top-0" />

      <div className="clickable w-full max-w-xl">
        <div className="rise flex items-center gap-2.5" style={riseAt(0)}>
          <Logo size={28} />
          <Label>{t("shell.firstRun.eyebrow")}</Label>
        </div>

        <h1
          className="rise mt-4 text-balance font-bold font-display text-3xl text-ink leading-tight tracking-tight"
          style={riseAt(1)}
        >
          {t("shell.firstRun.title")}
        </h1>

        <p className="rise mt-3 text-ink-3 leading-relaxed" style={riseAt(2)}>
          {t("shell.firstRun.body")}
        </p>

        <ol className="mt-8 flex flex-col">
          {STEPS.map((step, index) => (
            <li
              className="rise flex gap-4"
              key={step}
              style={riseAt(3 + index)}
            >
              <div className="flex flex-col items-center self-stretch">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-line-strong font-data text-[12px] text-ink-2 tabular-nums">
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

        <div
          className="rise flex flex-wrap items-center gap-2 border-line border-t pt-6"
          style={riseAt(6)}
        >
          <Button icon={Plus} onClick={onAddServer} variant="inverse">
            {t("shell.firstRun.addServer")}
          </Button>
          <Button icon={SettingsIcon} onClick={onSettings} variant="discreet">
            {t("shell.firstRun.settings")}
          </Button>
        </div>
      </div>
    </div>
  );
}
