import type { ProbeResult } from "@pupitre/shared/agent-protocol/install";
import { useTranslations } from "@renderer/i18n/use-translations";
import { Label } from "../ui/label";

/**
 * The machine in four figures, as the probe measured them.
 *
 * Nothing is converted and nothing is rounded further: what is shown is what
 * the next screen will weigh services against.
 */
export function OnboardingInspectionSummary({ probe }: { probe: ProbeResult }) {
  const t = useTranslations();

  const cells = [
    {
      label: t("onboarding.summary.distribution"),
      value: `${probe.os} ${probe.version}`.trim(),
    },
    { label: t("onboarding.summary.architecture"), value: probe.arch },
    { label: t("onboarding.summary.memory"), value: `${probe.ram_mb} Mo` },
    {
      label: t("onboarding.summary.diskFree"),
      value: `${probe.disk_free_gb} Go`,
    },
  ];

  return (
    <dl className="grid grid-cols-2 gap-4 rounded-sm bg-sunken p-4">
      {cells.map((cell) => (
        <div className="flex flex-col gap-1" key={cell.label}>
          <dt>
            <Label>{cell.label}</Label>
          </dt>
          <dd className="font-data text-ink tabular-nums">{cell.value}</dd>
        </div>
      ))}
    </dl>
  );
}
