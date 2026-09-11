import type { ProbeResult } from "@pupitre/shared/agent-protocol/install";
import { useTranslations } from "@renderer/i18n/use-translations";
import { ActionBar } from "../ui/action-bar";
import { Screen } from "../ui/screen";
import {
  type InspectionActions,
  OnboardingInspectionActions,
} from "./onboarding-inspection-actions";
import { OnboardingInspectionVerdict } from "./onboarding-inspection-verdict";

/**
 * The report, laid out: the machine, the verdict, then what to do about it —
 * on the bar the screen ends on, where every step's gesture is.
 */
export function OnboardingInspectionResult({
  probe,
  serverName,
  ...actions
}: { probe: ProbeResult; serverName?: string } & InspectionActions) {
  const t = useTranslations();

  return (
    <Screen
      column
      eyebrow={t("onboarding.inspection.eyebrow")}
      footer={
        <ActionBar name="inspection">
          <OnboardingInspectionActions probe={probe} {...actions} />
        </ActionBar>
      }
      plain
      step="inspection"
      title={serverName ?? t("onboarding.thisServer")}
    >
      <OnboardingInspectionVerdict probe={probe} />
    </Screen>
  );
}
