import type { ProbeResult } from "@pupitre/shared/agent-protocol/install";
import { Label } from "../ui/label";

/**
 * The machine in four figures, as the probe measured them.
 *
 * Nothing is converted and nothing is rounded further: what is shown is what
 * the next screen will weigh services against.
 */
export function OnboardingInspectionSummary({ probe }: { probe: ProbeResult }) {
  const cells = [
    { label: "Distribution", value: `${probe.os} ${probe.version}`.trim() },
    { label: "Architecture", value: probe.arch },
    { label: "Mémoire", value: `${probe.ram_mb} Mo` },
    { label: "Disque libre", value: `${probe.disk_free_gb} Go` },
  ];

  return (
    <dl className="grid grid-cols-2 gap-4 rounded-md bg-sunken p-4">
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
