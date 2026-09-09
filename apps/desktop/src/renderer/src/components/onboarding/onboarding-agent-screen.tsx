import { useTranslations } from "@renderer/i18n/use-translations";
import { phasesAt } from "@renderer/lib/waiting-phases";
import { AGENT_SEND_PHASES } from "@shared/install";
import { ArrowRight } from "lucide-react";
import { humanBytes } from "../../lib/duration";
import { useOnboarding } from "../../stores/onboarding";
import { Button } from "../ui/button";
import { Details } from "../ui/details";
import { PageHeader } from "../ui/page-header";
import { StatusDot } from "../ui/status-dot";
import { StepFailure } from "../ui/step-failure";
import { WaitingNotice } from "../ui/waiting-notice";
import { OnboardingEnrollmentNote } from "./onboarding-enrollment-note";

/**
 * The agent's binary, put on the machine before anything is asked of it.
 *
 * The server is enrolled first: the platform gives it a seat, names the release
 * to push, and hands the binary over. Only a development build without an
 * account still pushes the one the app built locally. The usage right was
 * settled before the onboarding opened, so nothing is asked of it here.
 */
export function OnboardingAgentScreen({
  serverName,
  onContinue,
}: {
  serverName?: string;
  onContinue?: () => void;
}) {
  const t = useTranslations();

  const delivery = useOnboarding((state) => state.delivery);
  const sendAgent = useOnboarding((state) => state.sendAgent);

  return (
    <section className="flex flex-col gap-section">
      <PageHeader
        actions={
          delivery.status === "sent" ? (
            <Button icon={ArrowRight} onClick={onContinue} variant="inverse">
              {t("onboarding.agent.readCatalog")}
            </Button>
          ) : null
        }
        description={t("onboarding.agent.description")}
        eyebrow={t("onboarding.agent.eyebrow")}
        title={serverName ?? t("onboarding.thisServer")}
      />

      {delivery.status === "failed" ? (
        <StepFailure error={delivery.error} onRetry={sendAgent} />
      ) : null}

      {delivery.status === "sent" ? (
        <>
          <OnboardingEnrollmentNote
            enrollment={delivery.delivery.enrollment ?? null}
          />

          <div className="elevation-raised flex items-start gap-3 rounded-md border border-line bg-surface px-4 py-4">
            <span className="translate-y-1">
              <StatusDot shape="filled" size={12} tone="ok" />
            </span>
            <div className="min-w-0">
              <p className="font-medium text-ink">
                {t("onboarding.agent.inPlace")}
              </p>
              <Details className="mt-1">
                <span className="font-data">
                  {delivery.delivery.path} · linux-{delivery.delivery.arch} ·{" "}
                  {humanBytes(delivery.delivery.bytes)} · sha256{" "}
                  {delivery.delivery.sha256}
                </span>
              </Details>
            </div>
          </div>
        </>
      ) : null}

      {delivery.status === "sending" || delivery.status === "idle" ? (
        <WaitingNotice
          detail={t("onboarding.agent.sendingDetail")}
          note={t("onboarding.agent.sendingNote")}
          phases={phasesAt(
            AGENT_SEND_PHASES,
            delivery.status === "sending" ? delivery.phase : "reading",
            (id) => t(`onboarding.agent.phase.${id}`)
          )}
          title={t("onboarding.agent.sendingTitle")}
        />
      ) : null}
    </section>
  );
}
