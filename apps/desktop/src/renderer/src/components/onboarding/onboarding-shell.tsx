import { LiveRegion } from "@renderer/components/ui/live-region";
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

/**
 * What stays while a step is replaced.
 *
 * The rail, the band and the name of the machine belong to the whole sequence,
 * not to any one of its steps. Replacing them along with the panel is what made
 * every transition read as a new screen rather than as a step: nothing was left
 * to say you were still on the same machine.
 */
export function OnboardingShell({
  step,
  stage,
  serverName,
  canGoBack,
  onBack,
  onClose,
  banner,
  children,
}: {
  step: OnboardingStep;
  /** Where the first step is within itself, which the rail shows in place. */
  stage?: ServerStage;
  serverName?: string;
  canGoBack: boolean;
  onBack: () => void;
  onClose: () => void;
  /** What holds the whole sequence: a channel lost, a usage right not confirmed. */
  banner?: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations();

  return (
    <div className="grid h-full grid-cols-1 bg-base md:grid-cols-[15rem_1fr]">
      <LiveRegion />

      <OnboardingRail serverName={serverName} stage={stage} step={step} />

      <div className="flex min-h-0 min-w-0 flex-col">
        {/*
          Everything sits at the left of this band: the right end of a window is
          where Windows and Linux draw their own buttons, over the page.
        */}
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

        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
