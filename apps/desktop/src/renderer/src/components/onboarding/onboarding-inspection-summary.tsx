import type { ProbeResult } from "@pupitre/shared/agent-protocol/install";
import { useTranslations } from "@renderer/i18n/use-translations";
import { measured, memory } from "@renderer/lib/format";
import { Fact, FactList } from "../ui/fact";

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
