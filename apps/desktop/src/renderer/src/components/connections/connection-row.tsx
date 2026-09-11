import type { Manifest } from "@pupitre/shared/catalog";
import { ServiceLogo } from "@renderer/components/ui/service-logo";
import { StatusDot } from "@renderer/components/ui/status-dot";
import { useTranslations } from "@renderer/i18n/use-translations";
import { useConnections } from "@renderer/stores/connections";
import { ChevronRight } from "lucide-react";
import { ConnectionCard } from "./connection-card";
import type { ConnectionDescriptor } from "./connection-descriptors";

/**
 * One account on a line, and its form folded under it.
 *
 * A list rather than a screen per provider: the catalogue gains accounts faster
 * than a row of tabs can take them, and what a reader wants at a glance is
 * which are connected — not four forms stacked on top of each other. The line
 * says the name, the brand and the state; the fold holds what there is to type,
 * and every one of them starts closed: a page that opened three forms at once
 * would be the stack this replaces.
 */
export function ConnectionRow({
  connection,
  installed,
  manifests,
  serverName,
}: {
  connection: ConnectionDescriptor;
  installed: readonly string[];
  manifests: readonly Manifest[] | null;
  serverName: string | null;
}) {
  const t = useTranslations();

  const state = useConnections((store) => store.state[connection.kind]);

  const connected = state.status === "connected";
  const account = connected ? state.account : null;

  return (
    <details
      className="group border-line border-b last:border-b-0"
      data-connection-row={connection.kind}
    >
      <summary className="clickable flex cursor-pointer items-center gap-3 px-4 py-3 transition-soft hover:bg-raised">
        <ServiceLogo moduleId={connection.logo} name={t(connection.title)} />

        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] text-ink">
            {t(connection.title)}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-ink-3">
            <StatusDot
              label={t(
                connected ? "connections.state.on" : "connections.state.off"
              )}
              shape={connected ? "filled" : "empty"}
              size={9}
              tone={connected ? "ok" : "neutral"}
            />
            <span className="truncate">
              {connected
                ? (account?.name ?? t("connections.held"))
                : t("connections.state.off")}
            </span>
          </span>
        </span>

        <ChevronRight
          aria-hidden="true"
          className="shrink-0 text-ink-3 transition-soft group-open:rotate-90"
          size={14}
          strokeWidth={1.5}
        />
      </summary>

      <div className="px-4 pt-1 pb-4">
        <ConnectionCard
          connection={connection}
          installed={installed}
          manifests={manifests}
          serverName={serverName}
        />
      </div>
    </details>
  );
}
