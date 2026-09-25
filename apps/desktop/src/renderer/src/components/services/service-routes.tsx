import type { TunnelStatusResult } from "@pupitre/shared/agent-protocol/secrets";
import { Button } from "@renderer/components/ui/button";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { Panel } from "@renderer/components/ui/panel";
import { Section } from "@renderer/components/ui/section";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { AgentError } from "@shared/agent";
import { RefreshCw } from "lucide-react";

export function ServiceRoutes({
  tunnel,
  busy,
  problem,
  onSync,
}: {
  tunnel: TunnelStatusResult;
  busy: string | null;
  problem: AgentError | null;
  onSync: () => void;
}) {
  const t = useTranslations();

  return (
    <Section
      actions={
        <Button
          icon={RefreshCw}
          loading={busy === "tunnel.sync"}
          onClick={onSync}
          size="sm"
        >
          {t("services.tunnel.sync")}
        </Button>
      }
      data-tunnel={tunnel.state}
      title={t("services.routes.title")}
    >
      {problem ? <ErrorNotice error={problem} /> : null}

      {tunnel.routes.length === 0 ? (
        <p className="text-ink-3 text-small">{t("services.tunnel.noRoutes")}</p>
      ) : (
        <Panel as="ul" list>
          {tunnel.routes.map((route) => (
            <li
              className="flex flex-wrap items-center gap-3 px-4 py-3"
              data-route={route.hostname}
              key={route.hostname}
            >
              <code className="min-w-0 flex-1 truncate font-data text-ink text-small">
                {route.hostname}
              </code>
              <code className="font-data text-ink-3 text-small">
                {route.service}
              </code>
              {route.project ? (
                <span className="text-ink-3 text-small">{route.project}</span>
              ) : null}
            </li>
          ))}
        </Panel>
      )}
    </Section>
  );
}
