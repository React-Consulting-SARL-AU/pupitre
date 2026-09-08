import type { Service } from "@pupitre/shared/agent-protocol/state";
import { EmptyState } from "@renderer/components/ui/empty-state";
import { ServiceLogo } from "@renderer/components/ui/service-logo";
import { StatePill } from "@renderer/components/ui/state-pill";
import { useTranslations } from "@renderer/i18n/use-translations";
import { SERVICE_LOOK } from "@renderer/lib/project-state";
import { Boxes } from "lucide-react";

/**
 * What the machine runs besides the projects, as the agent reports it.
 *
 * The list is the agent's: a module it did not install is not a row here, and
 * the app holds no catalogue of its own. The logo is the one splash of colour
 * the system allows.
 */
export function DashboardServices({
  services,
}: {
  services: readonly Service[];
}) {
  const t = useTranslations();

  if (services.length === 0) {
    return (
      <EmptyState
        detail={t("dashboard.services.empty")}
        icon={Boxes}
        title={t("dashboard.services.emptyTitle")}
      />
    );
  }

  return (
    <div className="grid gap-gutter sm:grid-cols-2">
      {services.map((service) => (
        <div
          className="elevation-raised flex items-center gap-3 rounded-md border border-line bg-surface p-3"
          key={service.id}
        >
          <ServiceLogo moduleId={service.id} name={service.name} size={20} />

          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-[13px] text-ink">
              {service.name}
            </p>
            <p className="truncate font-data text-[11px] text-ink-3">
              {service.id}
              {service.version ? ` · ${service.version}` : ""}
              {service.port ? ` · port ${service.port}` : ""}
            </p>
          </div>

          <StatePill look={SERVICE_LOOK[service.state]} name={service.state} />
        </div>
      ))}
    </div>
  );
}
