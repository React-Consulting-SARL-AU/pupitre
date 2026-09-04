import type { ProbeResult } from "@pupitre/shared/agent-protocol/install";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { Resources, ResourceWarning } from "../../lib/catalog-selection";
import { Callout } from "../ui/callout";
import { Label } from "../ui/label";

/**
 * What the selection asks of the machine, against what the probe measured.
 *
 * Both halves are shown at all times — the reader should see the margin narrow,
 * not only be told once it is gone — and the warning appears only when the sum
 * passes what the machine actually has.
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

  const cells = [
    {
      label: t("catalog.resources.ramLabel"),
      asked: t("catalog.resources.megabytes", { mb: needs.ram_mb }),
      has: probe
        ? t("catalog.resources.ramHas", { mb: probe.ram_mb })
        : t("catalog.resources.unmeasured"),
    },
    {
      label: t("catalog.resources.diskLabel"),
      asked: t("catalog.resources.megabytes", { mb: needs.disk_mb }),
      has: probe
        ? t("catalog.resources.diskHas", { gb: probe.disk_free_gb })
        : t("catalog.resources.unmeasured"),
    },
  ];

  return (
    <section className="flex flex-col gap-3">
      <dl className="grid gap-4 rounded-md bg-sunken p-4 sm:grid-cols-2">
        {cells.map((cell) => (
          <div className="flex flex-col gap-1" key={cell.label}>
            <dt>
              <Label>{cell.label}</Label>
            </dt>
            <dd className="flex items-baseline gap-2">
              <span className="font-data text-ink tabular-nums">
                {cell.asked}
              </span>
              <span className="font-data text-[11px] text-ink-3 tabular-nums">
                {cell.has}
              </span>
            </dd>
          </div>
        ))}
      </dl>

      {warnings.map((warning) => (
        <Callout key={warning.kind} tone="warn">
          {warning.message}
        </Callout>
      ))}
    </section>
  );
}
