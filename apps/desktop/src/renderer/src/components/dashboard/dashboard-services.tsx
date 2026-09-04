import type { Service } from "@pupitre/shared/agent-protocol/state";
import { EmptyState } from "@renderer/components/ui/empty-state";
import { ServiceLogo } from "@renderer/components/ui/service-logo";
import { StatePill } from "@renderer/components/ui/state-pill";
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
  if (services.length === 0) {
    return (
      <EmptyState
        detail="L'agent n'a installé aucun module sur cette machine."
        icon={Boxes}
        title="Aucun service"
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
            <p className="truncate font-medium text-[12px] text-ink">
              {service.name}
            </p>
            <p className="truncate font-data text-[10px] text-ink-3">
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
