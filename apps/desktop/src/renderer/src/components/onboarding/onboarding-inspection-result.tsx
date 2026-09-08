import type { ProbeResult } from "@pupitre/shared/agent-protocol/install";
import { useTranslations } from "@renderer/i18n/use-translations";
import { measured } from "@renderer/lib/format";
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

  const machine = [
    `${probe.os} ${probe.version}`.trim(),
    probe.arch,
    `${probe.ram_mb} ${t("format.unit.mb")}`,
    t("onboarding.inspection.diskFree", {
      disk: `${measured(probe.disk_free_gb)} ${t("format.unit.gb")}`,
    }),
  ].join(" · ");

  return (
    <section className="flex flex-col gap-section">
      <PageHeader
        description={
          <span className="font-data text-ink-3 tabular-nums">{machine}</span>
        }
        eyebrow={t("onboarding.inspection.eyebrow")}
        title={serverName ?? t("onboarding.thisServer")}
      />

      <OnboardingInspectionVerdict probe={probe} />

      <OnboardingInspectionActions probe={probe} {...actions} />
    </section>
  );
}
