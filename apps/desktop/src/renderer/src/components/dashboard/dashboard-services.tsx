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
 * the app holds no catalogue of its own. Only the modules whose manifest says
 * they hold a process are shown — a language, a CLI or a hardening pass has no
 * state to watch, and belongs to the services page, not to this one. The logo
 * is the one splash of colour the system allows. A card opens the service's
 * own page, where it is configured, read and stopped.
 */
export function DashboardServices({
  services,
  onOpen,
}: {
  services: readonly Service[];
  onOpen?: (moduleId: string) => void;
}) {
  const t = useTranslations();

  const running = services.filter((service) => service.runs);

  if (running.length === 0) {
    return (
      <EmptyState icon={Boxes} title={t("dashboard.services.emptyTitle")} />
    );
  }

  return (
    <div className="grid gap-gutter sm:grid-cols-2">
      {running.map((service) => (
        <button
          className="elevation-raised flex w-full items-center gap-3 rounded-md border border-line bg-surface p-3 text-left transition-soft hover:bg-raised"
          data-service={service.id}
          key={service.id}
          onClick={() => onOpen?.(service.id)}
          title={t("dashboard.services.open", { name: service.name })}
          type="button"
        >
          <ServiceLogo moduleId={service.id} name={service.name} size={20} />

          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-[13px] text-ink">
              {service.name}
            </p>
            <p className="truncate font-data text-[11px] text-ink-3">
              {[service.version, service.port ? `port ${service.port}` : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>

          <StatePill look={SERVICE_LOOK[service.state]} name={service.state} />
        </button>
      ))}
    </div>
  );
}
