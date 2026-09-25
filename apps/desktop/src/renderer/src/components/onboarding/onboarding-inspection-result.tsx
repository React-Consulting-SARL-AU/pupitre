import type { ProbeResult } from "@pupitre/shared/agent-protocol/install";
import { useTranslations } from "@renderer/i18n/use-translations";
import { ActionBar } from "../ui/action-bar";
import { Screen } from "../ui/screen";
import {
  type InspectionActions,
  OnboardingInspectionActions,
} from "./onboarding-inspection-actions";
import { OnboardingInspectionVerdict } from "./onboarding-inspection-verdict";

export function OnboardingInspectionResult({
  probe,
  serverName,
  ...actions
}: { probe: ProbeResult; serverName?: string } & InspectionActions) {
  const t = useTranslations();

  return (
    <Screen
      column
      eyebrow={serverName ?? t("onboarding.thisServer")}
      footer={
        <ActionBar name="inspection">
          <OnboardingInspectionActions probe={probe} {...actions} />
        </ActionBar>
      }
      plain
      step="inspection"
      title={t("onboarding.inspection.title")}
    >
      <OnboardingInspectionVerdict probe={probe} />
    </Screen>
  );
}
