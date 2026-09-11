import type { Service } from "@pupitre/shared/agent-protocol/state";
import { ServiceLogo } from "@renderer/components/ui/service-logo";
import { StatePill } from "@renderer/components/ui/state-pill";
import { SERVICE_LOOK, UNCONFIGURED_LOOK } from "@renderer/lib/project-state";
import { ChevronRight } from "lucide-react";

/**
 * One installed module, in one line: what it is, how it is doing, what it
 * listens on. Every word of it came from the snapshot the agent just answered.
 */
export function ServiceRow({
  service,
  onOpen,
}: {
  service: Service;
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
          <span className="block truncate font-medium text-[13px] text-ink">
            {service.name}
          </span>
          <span className="block truncate font-data text-[11.5px] text-ink-3">
            {facts.join(" · ")}
          </span>
        </span>

        {/*
          What a module still owes the reader comes before how it is running: a
          service nobody has configured is not a service that went wrong. An
          agent older than the field says nothing of it, and owes nothing.
        */}
        {service.configured === false ? (
          <StatePill look={UNCONFIGURED_LOOK} name="unconfigured" />
        ) : (
          <StatePill look={SERVICE_LOOK[service.state]} name={service.state} />
        )}

        <ChevronRight
          className="shrink-0 text-ink-4"
          size={14}
          strokeWidth={1.5}
        />
      </button>
    </li>
  );
}
