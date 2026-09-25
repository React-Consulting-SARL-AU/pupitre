import type { ProbeResult } from "@pupitre/shared/agent-protocol/install";
import { agentText } from "@renderer/i18n/agent-error";
import { useTranslations } from "@renderer/i18n/use-translations";
import { memory } from "@renderer/lib/format";
import type { Resources, ResourceWarning } from "../../lib/catalog-selection";
import { Callout } from "../ui/callout";

const MB_PER_GB = 1024;

/**
 * What the selection asks of the machine, against what the probe measured.
 *
 * One line, in figures, because the margin is what decides; and a warning only
 * when the sum passes what the machine actually has.
 */
export function CatalogResources({
  needs,
  probe,
  warnings,
}: {
  needs: Resources;
  probe: ProbeResult | null;
  warnings: readonly ResourceWarning[];
}) {
  const t = useTranslations();

  const line = probe
    ? t("catalog.resources.line", {
        disk: memory(needs.disk_mb),
        diskHas: memory(probe.disk_free_gb * MB_PER_GB),
        ram: memory(needs.ram_mb),
        ramHas: memory(probe.ram_mb),
      })
    : t("catalog.resources.unmeasured", {
        disk: memory(needs.disk_mb),
        ram: memory(needs.ram_mb),
      });

  return (
    <section className="flex flex-col gap-3">
      <p
        className="font-data text-ink-3 text-small tabular-nums"
        data-resources="true"
      >
        {line}
      </p>

      {warnings.map((warning) => (
        <Callout key={warning.kind} tone="warn">
          {agentText(t, warning).message}
        </Callout>
      ))}
    </section>
  );
}
