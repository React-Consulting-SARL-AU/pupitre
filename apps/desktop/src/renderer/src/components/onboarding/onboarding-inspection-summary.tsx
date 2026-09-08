import type { ProbeResult } from "@pupitre/shared/agent-protocol/install";
import { useTranslations } from "@renderer/i18n/use-translations";
import { measured } from "@renderer/lib/format";
import { Label } from "../ui/label";

/**
 * The machine in four figures, as the probe measured them.
 *
 * Nothing is converted and nothing is rounded further: what is shown is what
 * the next screen will weigh services against. Only the unit words and the
 * decimal mark follow the reader's language.
 */
export function OnboardingInspectionSummary({ probe }: { probe: ProbeResult }) {
  const t = useTranslations();

  const cells = [
    {
      label: t("onboarding.summary.distribution"),
      value: `${probe.os} ${probe.version}`.trim(),
    },
    { label: t("onboarding.summary.architecture"), value: probe.arch },
    {
      label: t("onboarding.summary.memory"),
      value: `${probe.ram_mb} ${t("format.unit.mb")}`,
    },
    {
      label: t("onboarding.summary.diskFree"),
      value: `${measured(probe.disk_free_gb)} ${t("format.unit.gb")}`,
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
