import type { ProjectState } from "@pupitre/shared/agent-protocol/state";
import type { DictionaryKey } from "@renderer/i18n/en";
import { useTranslations } from "@renderer/i18n/use-translations";
import { ExternalLink } from "lucide-react";
import { publicUrl } from "../../lib/public-url";
import { Button } from "../ui/button";
import { Panel } from "../ui/panel";
import { StatusDot } from "../ui/status-dot";

const LOOK: Partial<
  Record<ProjectState, { shape: "filled" | "breathing"; label: DictionaryKey }>
> = {
  online: { label: "state.project.online", shape: "filled" },
  partial: { label: "state.project.partial", shape: "breathing" },
  starting: { label: "state.project.starting", shape: "breathing" },
};

/**
 * The project as the agent leaves it: its state and its address.
 *
 * The address is the agent's own — a tunnel gives a public one, a bare machine
 * gives the port — so nothing here builds a URL of its own.
 */
export function ProjectAddOutcome({
  name,
  state,
  url,
  onOpen,
}: {
  name: string;
  state: ProjectState;
  url?: string;
  onOpen?: (url: string) => void;
}) {
  const t = useTranslations();

  const look = LOOK[state] ?? {
    label: `state.project.${state}` as DictionaryKey,
    shape: "filled" as const,
  };
  const address = publicUrl(url);

  return (
    <Panel
      className="flex flex-wrap items-start justify-between gap-4"
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
          </p>
        </div>
      </div>

      {address ? (
        <Button icon={ExternalLink} onClick={() => onOpen?.(address)}>
          {t("projectAdd.outcome.open")}
        </Button>
      ) : null}
    </Panel>
  );
}
