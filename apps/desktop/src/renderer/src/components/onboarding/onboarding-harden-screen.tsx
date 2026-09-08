import { useTranslations } from "@renderer/i18n/use-translations";
import { useHarden } from "../../stores/harden";
import { InstallStepRow } from "../install/install-step-row";
import { PageHeader } from "../ui/page-header";
import { StepFailure } from "../ui/step-failure";
import { WaitingNotice } from "../ui/waiting-notice";
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

  return (
    <section className="flex flex-col gap-section">
      <PageHeader
        description={t("onboarding.harden.description")}
        eyebrow={t("onboarding.harden.eyebrow")}
        title={serverName ?? t("onboarding.thisServer")}
      />

      {harden.status === "running" ? (
        <WaitingNotice
          detail={t("onboarding.harden.runningDetail")}
          note={t("onboarding.harden.runningNote")}
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
        <StepFailure error={harden.error} onRetry={() => start(serverId)} />
      ) : null}

      {harden.status === "done" ? (
        <OnboardingHardenOutcome
          onContinue={onContinue}
          onRetry={() => start(serverId)}
          outcome={harden.outcome}
        />
      ) : null}
    </section>
  );
}
