import type { ProjectState } from "@pupitre/shared/agent-protocol/state";
import type { DictionaryKey } from "@renderer/i18n/en";
import { useTranslations } from "@renderer/i18n/use-translations";
import { ExternalLink } from "lucide-react";
import { Button } from "../ui/button";
import { StatusDot } from "../ui/status-dot";

const LOOK: Partial<
  Record<ProjectState, { shape: "filled" | "breathing"; label: DictionaryKey }>
> = {
  online: { label: "state.project.online", shape: "filled" },
  starting: { label: "state.project.starting", shape: "breathing" },
};

/**
 * The project as the agent leaves it: its state, its port, its address.
 *
 * The address is the agent's own — a tunnel gives a public one, a bare machine
 * gives the port — so nothing here builds a URL of its own.
 */
export function ProjectAddOutcome({
  name,
  state,
  port,
  url,
  onOpen,
}: {
  name: string;
  state: ProjectState;
  port?: number;
  url?: string;
  onOpen?: (url: string) => void;
}) {
  const t = useTranslations();

  const look = LOOK[state] ?? {
    label: `state.project.${state}` as DictionaryKey,
    shape: "filled" as const,
  };

  return (
    <div
      className="elevation-raised flex flex-wrap items-start justify-between gap-4 rounded-md border border-line bg-surface px-4 py-4"
      data-outcome={state}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="translate-y-1">
          <StatusDot
            label={t(look.label)}
            shape={look.shape}
            size={12}
            tone={state === "online" ? "ok" : "neutral"}
          />
        </span>

        <div className="min-w-0">
          <p className="font-medium text-ink">
            <code className="font-data">{name}</code> {t(look.label)}
          </p>
          <p className="mt-1 font-data text-[12px] text-ink-3">
            {url ?? t("projectAdd.outcome.unknownAddress")}
            {port ? ` · port ${port}` : ""}
          </p>
        </div>
      </div>

      {url ? (
        <Button icon={ExternalLink} onClick={() => onOpen?.(url)}>
          {t("projectAdd.outcome.open")}
        </Button>
      ) : null}
    </div>
  );
}
