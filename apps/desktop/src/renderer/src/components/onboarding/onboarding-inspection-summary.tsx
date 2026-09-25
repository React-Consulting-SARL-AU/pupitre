import type { ProbeResult } from "@pupitre/shared/agent-protocol/install";
import { useTranslations } from "@renderer/i18n/use-translations";
import { measured, memory } from "@renderer/lib/format";
import { Fact, FactList } from "../ui/fact";

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
      value: memory(probe.ram_mb),
    },
    {
      label: t("onboarding.summary.diskFree"),
      value: `${measured(probe.disk_free_gb)} ${t("format.unit.gb")}`,
    },
  ];

  return (
    <FactList className="rounded-sm bg-sunken p-4">
      {cells.map((cell) => (
        <Fact key={cell.label} label={cell.label}>
          {cell.value}
        </Fact>
      ))}
    </FactList>
  );
}
