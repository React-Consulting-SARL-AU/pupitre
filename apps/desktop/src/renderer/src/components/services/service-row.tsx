import type { LoginState, Service } from "@pupitre/shared/agent-protocol/state";
import { ServiceLogo } from "@renderer/components/ui/service-logo";
import { StatePill } from "@renderer/components/ui/state-pill";
import {
  LOGIN_LOOK,
  SERVICE_LOOK,
  UNCONFIGURED_LOOK,
} from "@renderer/lib/project-state";
import { ChevronRight } from "lucide-react";

export function ServiceRow({
  service,
  account,
  onOpen,
}: {
  service: Service;
  account?: LoginState;
  onOpen: () => void;
}) {
  const facts = [
    service.version,
    service.port ? `port ${service.port}` : null,
  ].filter(Boolean);

  return (
    <li data-service={service.id}>
      <button
        className="clickable flex w-full items-center gap-3 px-4 py-3 text-left transition-soft hover:bg-raised"
        onClick={onOpen}
        type="button"
      >
        <ServiceLogo moduleId={service.id} name={service.name} size={20} />

        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-control text-ink">
            {service.name}
          </span>
          <span className="block truncate font-data text-caption text-ink-3">
            {facts.join(" · ")}
          </span>
        </span>

        {/* An agent older than `configured` leaves it undefined: only false means unconfigured. */}
        <span className="flex flex-wrap items-center justify-end gap-1.5">
          {service.configured === false ? (
            <StatePill look={UNCONFIGURED_LOOK} name="unconfigured" />
          ) : (
            <StatePill
              look={SERVICE_LOOK[service.state]}
              name={service.state}
            />
          )}
          {account ? (
            <StatePill look={LOGIN_LOOK[account]} name={account} />
          ) : null}
        </span>

        <ChevronRight
          className="shrink-0 text-ink-4"
          size={14}
          strokeWidth={1.5}
        />
      </button>
    </li>
  );
}
