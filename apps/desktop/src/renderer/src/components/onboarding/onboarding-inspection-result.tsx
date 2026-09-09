import type { ProbeResult } from "@pupitre/shared/agent-protocol/install";
import { useTranslations } from "@renderer/i18n/use-translations";
import { PageHeader } from "../ui/page-header";
import {
  type InspectionActions,
  OnboardingInspectionActions,
} from "./onboarding-inspection-actions";
import { OnboardingInspectionVerdict } from "./onboarding-inspection-verdict";

/**
 * The report, laid out: the machine, the verdict, then what to do about it.
 */
export function OnboardingInspectionResult({
  probe,
  serverName,
  ...actions
}: { probe: ProbeResult; serverName?: string } & InspectionActions) {
  const t = useTranslations();

  return (
    <section className="flex flex-col gap-section">
      <PageHeader
        description={t("onboarding.inspection.found")}
        eyebrow={t("onboarding.inspection.eyebrow")}
        title={serverName ?? t("onboarding.thisServer")}
      />

      <OnboardingInspectionVerdict probe={probe} />

      <OnboardingInspectionActions probe={probe} {...actions} />
    </section>
  );
}
