import { agentText } from "@renderer/i18n/agent-error";
import { useTranslations } from "@renderer/i18n/use-translations";
import { RefreshCw, Server } from "lucide-react";
import { useInspection } from "../../stores/inspection";
import { ActionBar } from "../ui/action-bar";
import { Button } from "../ui/button";
import { Callout } from "../ui/callout";
import { Screen } from "../ui/screen";
import { WaitingNotice } from "../ui/waiting-notice";
import type { InspectionActions } from "./onboarding-inspection-actions";
import { OnboardingInspectionResult } from "./onboarding-inspection-result";

/**
 * The inspection of one server, from the wait to the verdict.
 *
 * The probe only reads: it is sent on standard input and runs from memory, so a
 * server we decide against is left exactly as it was found. The screen says so,
 * because that is the promise being made while the reader waits. The probe is
 * asked for by the onboarding on entering the step; this only draws its answer
 * and offers to ask again.
 */
export function OnboardingInspectionScreen({
  serverId,
  serverName,
  ...actions
}: { serverId: string; serverName?: string } & InspectionActions) {
  const t = useTranslations();

  const inspection = useInspection((state) => state.inspection);
  const inspect = useInspection((state) => state.inspect);

  if (inspection.status === "done" && inspection.serverId === serverId) {
    return (
      <OnboardingInspectionResult
        probe={inspection.probe}
        serverName={serverName}
        {...actions}
      />
    );
  }

  const failed =
    inspection.status === "failed" && inspection.serverId === serverId
      ? inspection.error
      : null;

  return (
    <Screen
      column
      eyebrow={serverName ?? t("onboarding.thisServer")}
      footer={
        <ActionBar name="inspection">
          <Button
            icon={Server}
            onClick={actions.onPickAnother}
            variant="discreet"
          >
            {t("onboarding.inspection.pickAnother")}
          </Button>
        </ActionBar>
      }
      plain
      step="inspection"
      title={t("onboarding.inspection.title")}
    >
      {failed ? (
        <Callout
          action={
            <Button icon={RefreshCw} onClick={() => inspect(serverId)}>
              {t("onboarding.inspection.rerun")}
            </Button>
          }
          fix={agentText(t, failed).fix}
          tone="danger"
        >
          {agentText(t, failed).message}
        </Callout>
      ) : (
        <WaitingNotice
          detail={t("onboarding.inspection.waitingDetail")}
          title={t("onboarding.inspection.waitingTitle")}
        />
      )}
    </Screen>
  );
}
