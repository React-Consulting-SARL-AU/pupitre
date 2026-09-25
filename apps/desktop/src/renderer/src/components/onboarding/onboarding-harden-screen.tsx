import { useTranslations } from "@renderer/i18n/use-translations";
import { ArrowRight } from "lucide-react";
import { hardenAction } from "../../lib/harden-action";
import { useHarden } from "../../stores/harden";
import { InstallStepRow } from "../install/install-step-row";
import { ActionBar } from "../ui/action-bar";
import { Button } from "../ui/button";
import { Panel } from "../ui/panel";
import { Screen } from "../ui/screen";
import { WaitingNotice } from "../ui/waiting-notice";
import { OnboardingHardenFailed } from "./onboarding-harden-failed";
import { OnboardingHardenOutcome } from "./onboarding-harden-outcome";
import { OnboardingHardenSudo } from "./onboarding-harden-sudo";

export function OnboardingHardenScreen({
  serverId,
  serverName,
  finishLabel,
  onContinue,
}: {
  serverId: string;
  serverName?: string;
  finishLabel?: string;
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
      eyebrow={serverName ?? t("onboarding.thisServer")}
      footer={
        <ActionBar name="harden" note={action.note ? t(action.note) : null}>
          <Button
            disabled={!action.enabled}
            icon={ArrowRight}
            onClick={onContinue}
            variant="inverse"
          >
            {action.label === "onboarding.finish" && finishLabel
              ? finishLabel
              : t(action.label)}
          </Button>
        </ActionBar>
      }
      plain
      step="harden"
      title={t("onboarding.harden.title")}
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
        <Panel as="ul" list>
          {steps.map((step) => (
            <InstallStepRow key={step.step} step={step} />
          ))}
        </Panel>
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

      {harden.status === "done" && harden.outcome.sudo ? (
        <OnboardingHardenSudo
          onRetry={() => start(serverId)}
          serverId={serverId}
          sudo={harden.outcome.sudo}
        />
      ) : null}
    </Screen>
  );
}
