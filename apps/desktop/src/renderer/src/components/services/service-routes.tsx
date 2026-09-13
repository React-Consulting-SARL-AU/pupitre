import type { TunnelStatusResult } from "@pupitre/shared/agent-protocol/secrets";
import { Button } from "@renderer/components/ui/button";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { Label } from "@renderer/components/ui/label";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { AgentError } from "@shared/agent";
import { RefreshCw } from "lucide-react";

/**
 * What the exposure module publishes: the agent's own list of routes.
 *
 * The state and the restart are the service's, said above with the rest; this
 * section holds only what the tunnel adds — the hostnames it answers for, and
 * the sync that rewrites them from the projects.
 */
export function ServiceRoutes({
  tunnel,
  busy,
  problem,
  onSync,
}: {
  tunnel: TunnelStatusResult;
  busy: string | null;
  /** What the last sync refused, the agent's or the account's. */
  problem: AgentError | null;
  onSync: () => void;
}) {
  const t = useTranslations();

  return (
    <section className="flex flex-col gap-3" data-tunnel={tunnel.state}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Label>{t("services.routes.title")}</Label>

        <Button
          icon={RefreshCw}
          loading={busy === "tunnel.sync"}
          onClick={onSync}
          size="sm"
        >
          {t("services.tunnel.sync")}
        </Button>
      </div>

      {problem ? <ErrorNotice error={problem} /> : null}

      {tunnel.routes.length === 0 ? (
        <p className="text-[12px] text-ink-3">
          {t("services.tunnel.noRoutes")}
        </p>
      ) : (
        <ul className="elevation-raised divide-y divide-line overflow-hidden rounded-md border border-line bg-surface">
          {tunnel.routes.map((route) => (
            <li
              className="flex flex-wrap items-center gap-3 px-4 py-3"
              data-route={route.hostname}
              key={route.hostname}
            >
              <code className="min-w-0 flex-1 truncate font-data text-[12px] text-ink">
                {route.hostname}
              </code>
              <code className="font-data text-[12px] text-ink-3">
                {route.service}
              </code>
              {route.project ? (
                <span className="text-[12px] text-ink-3">{route.project}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
