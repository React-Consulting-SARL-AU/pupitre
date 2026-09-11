import { useTranslations } from "@renderer/i18n/use-translations";
import { ArrowRight } from "lucide-react";
import { hardenAction } from "../../lib/harden-action";
import { useHarden } from "../../stores/harden";
import { InstallStepRow } from "../install/install-step-row";
import { ActionBar } from "../ui/action-bar";
import { Button } from "../ui/button";
import { Screen } from "../ui/screen";
import { WaitingNotice } from "../ui/waiting-notice";
import { OnboardingHardenFailed } from "./onboarding-harden-failed";
import { OnboardingHardenOutcome } from "./onboarding-harden-outcome";

/**
 * The last step of the onboarding: root closed, and the app moved to `dev`.
 *
 * The app asks for the hardening and watches the agent do it; it only rewrites
 * its own SSH configuration once the agent says root is closed — which the
 * agent only says once a key has opened `dev` in front of it.
 */
export function OnboardingHardenScreen({
  serverId,
  serverName,
  onContinue,
}: {
  serverId: string;
  serverName?: string;
  onContinue?: () => void;
}) {
  const t = useTranslations();

  const harden = useHarden((state) => state.harden);
  const steps = useHarden((state) => state.steps);
  const start = useHarden((state) => state.start);

  const action = hardenAction(harden);

  return (
    <Screen
      column
      description={t("onboarding.harden.description")}
      eyebrow={t("onboarding.harden.eyebrow")}
      footer={
        <ActionBar name="harden" note={action.note ? t(action.note) : null}>
          <Button
            disabled={!action.enabled}
            icon={ArrowRight}
            onClick={onContinue}
            variant="inverse"
          >
            {t(action.label)}
          </Button>
        </ActionBar>
      }
      plain
      step="harden"
      title={serverName ?? t("onboarding.thisServer")}
    >
      {harden.status === "queued" ? (
        <WaitingNotice
          detail={t("onboarding.harden.queuedDetail")}
          title={t("onboarding.harden.queuedTitle")}
        />
      ) : null}

      {harden.status === "running" ? (
        <WaitingNotice
          detail={t("onboarding.harden.runningDetail")}
          title={t("onboarding.harden.runningTitle")}
        />
      ) : null}

      {harden.status === "switching" ? (
        <WaitingNotice
          detail={t("onboarding.harden.switchingDetail", {
            user: harden.user,
          })}
          title={t("onboarding.harden.switchingTitle")}
        />
      ) : null}

      {steps.length > 0 ? (
        <ul className="elevation-raised divide-y divide-line overflow-hidden rounded-md border border-line bg-surface px-4 py-1">
          {steps.map((step) => (
            <InstallStepRow key={step.step} step={step} />
          ))}
        </ul>
      ) : null}

      {harden.status === "failed" ? (
        <OnboardingHardenFailed
          error={harden.error}
          onRetry={() => start(serverId)}
        />
      ) : null}

      {harden.status === "done" ? (
        <OnboardingHardenOutcome
          onRetry={() => start(serverId)}
          outcome={harden.outcome}
        />
      ) : null}
    </Screen>
  );
}
