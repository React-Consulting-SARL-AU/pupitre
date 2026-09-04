import type { ProbeResult } from "@pupitre/shared/agent-protocol/install";
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
  const machine = [
    `${probe.os} ${probe.version}`.trim(),
    probe.arch,
    `${probe.ram_mb} Mo`,
    `${probe.disk_free_gb} Go libres`,
  ].join(" · ");

  return (
    <section className="flex flex-col gap-8">
      <PageHeader
        description={
          <span className="font-data text-ink-3 tabular-nums">{machine}</span>
        }
        eyebrow="Inspection"
        title={serverName ?? "Ce serveur"}
      />

      <OnboardingInspectionVerdict probe={probe} />

      <OnboardingInspectionActions probe={probe} {...actions} />
    </section>
  );
}
