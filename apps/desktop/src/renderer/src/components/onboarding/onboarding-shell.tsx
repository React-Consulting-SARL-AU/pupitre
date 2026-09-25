import { WindowBand } from "@renderer/components/ui/window-band";
import { useTranslations } from "@renderer/i18n/use-translations";
import { ArrowLeft, X } from "lucide-react";
import type { ReactNode } from "react";
import type {
  OnboardingStep,
  ServerStage,
} from "../../stores/onboarding-machine";
import { Button } from "../ui/button";
import { OnboardingRail } from "./onboarding-rail";

export function OnboardingShell({
  step,
  steps,
  stage,
  serverName,
  canGoBack,
  onBack,
  onClose,
  banner,
  children,
}: {
  step: OnboardingStep;
  steps: readonly OnboardingStep[];
  stage?: ServerStage;
  serverName?: string;
  canGoBack: boolean;
  onBack: () => void;
  onClose: () => void;
  banner?: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations();

  return (
    <div className="grid h-full grid-cols-1 bg-base md:grid-cols-[15rem_1fr]">
      <OnboardingRail
        serverName={serverName}
        stage={stage}
        step={step}
        steps={steps}
      />

      <div className="flex min-h-0 min-w-0 flex-col">
        {/* Left-aligned: Windows and Linux draw their own buttons over the right end. */}
        <WindowBand className="shrink-0 gap-3 border-line border-b px-4">
          <div className="clickable flex shrink-0 items-center gap-1">
            {canGoBack ? (
              <Button icon={ArrowLeft} onClick={onBack} variant="discreet">
                {t("onboarding.flow.back")}
              </Button>
            ) : null}
            <Button icon={X} onClick={onClose} variant="discreet">
              {t("onboarding.flow.quit")}
            </Button>
          </div>

          <span className="label truncate text-ink-3 md:hidden">
            {t(`onboarding.step.${step}`)}
          </span>
        </WindowBand>

        {banner ? <div className="shrink-0 px-8 pt-3">{banner}</div> : null}

        {/* Clipped so the sideways step transition never shows a scrollbar. */}
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
