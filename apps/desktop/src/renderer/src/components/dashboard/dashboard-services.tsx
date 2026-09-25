import type { LoginState, Service } from "@pupitre/shared/agent-protocol/state";
import { Button } from "@renderer/components/ui/button";
import { EmptyState } from "@renderer/components/ui/empty-state";
import { panelClass } from "@renderer/components/ui/panel";
import { ServiceLogo } from "@renderer/components/ui/service-logo";
import { StatePill } from "@renderer/components/ui/state-pill";
import { Tooltip } from "@renderer/components/ui/tooltip";
import { useTranslations } from "@renderer/i18n/use-translations";
import { LOGIN_LOOK, SERVICE_LOOK } from "@renderer/lib/project-state";
import { Boxes, Plus } from "lucide-react";

/**
 * What the machine runs besides the projects, as the agent reports it.
 *
 * The list is the agent's: a module it did not install is not a row here, and
 * the app holds no catalogue of its own. Only the modules whose manifest says
 * they hold a process are shown — a language, a CLI or a hardening pass has no
 * state to watch, and belongs to the services page, not to this one. The logo
 * is the one splash of colour the system allows. A card opens the service's
 * own page, where it is configured, read and stopped.
 *
 * A service that runs as somebody — a coding agent, a tunnel — says whether
 * it is connected next to whether it runs: the two are read the same way, and
 * a CLI that runs signed out is the one thing a running state hides.
 */
export function DashboardServices({
  services,
  accounts = {},
  onOpen,
  onAdd,
}: {
  services: readonly Service[];
  /** Whose account each service works as, for those that work as somebody. */
  accounts?: Readonly<Record<string, LoginState>>;
  onOpen?: (moduleId: string) => void;
  onAdd?: () => void;
}) {
  const t = useTranslations();

  const running = services.filter((service) => service.runs);

  if (running.length === 0) {
    return (
      <EmptyState
        action={
          onAdd ? (
            <Button icon={Plus} onClick={onAdd}>
              {t("services.screen.add")}
            </Button>
          ) : null
        }
        icon={Boxes}
        title={t("dashboard.services.emptyTitle")}
      />
    );
  }

  return (
    <div className="grid gap-gutter sm:grid-cols-2">
      {running.map((service) => {
        const account = accounts[service.id];

        return (
          <Tooltip
            key={service.id}
            label={t("dashboard.services.open", { name: service.name })}
          >
            <button
              className={`${panelClass("sm")} flex w-full items-center gap-3 text-left transition-soft hover:bg-raised`}
              data-service={service.id}
              onClick={() => onOpen?.(service.id)}
              type="button"
            >
              <ServiceLogo
                moduleId={service.id}
                name={service.name}
                size={20}
              />

              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-control text-ink">
                  {service.name}
                </p>
                <p className="truncate font-data text-caption text-ink-3">
                  {[
                    service.version,
                    service.port ? `port ${service.port}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-1.5">
                <StatePill
                  look={SERVICE_LOOK[service.state]}
                  name={service.state}
                />
                {account ? (
                  <StatePill look={LOGIN_LOOK[account]} name={account} />
                ) : null}
              </div>
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
