import { Collapsible } from "@base-ui-components/react/collapsible";
import type { Manifest } from "@pupitre/shared/catalog";
import { ServiceLogo } from "@renderer/components/ui/service-logo";
import { StatusDot } from "@renderer/components/ui/status-dot";
import { useTranslations } from "@renderer/i18n/use-translations";
import { useConnections } from "@renderer/stores/connections";
import { ChevronRight } from "lucide-react";
import { ConnectionCard } from "./connection-card";
import type { ConnectionDescriptor } from "./connection-descriptors";

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
    <Collapsible.Root
      className="group border-line border-b last:border-b-0"
      data-connection-row={connection.kind}
    >
      <Collapsible.Trigger className="clickable flex w-full cursor-pointer items-center gap-3 px-5 py-3.5 text-left transition-soft hover:bg-raised">
        <ServiceLogo moduleId={connection.logo} name={t(connection.title)} />

        <span className="min-w-0 flex-1">
          <span className="block truncate text-control text-ink">
            {t(connection.title)}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 text-ink-3 text-small">
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
          className="shrink-0 text-ink-3 transition-soft group-data-[open]:rotate-90"
          size={14}
          strokeWidth={1.5}
        />
      </Collapsible.Trigger>

      <Collapsible.Panel className="px-5 pt-1 pb-5">
        <ConnectionCard
          connection={connection}
          installed={installed}
          manifests={manifests}
          serverName={serverName}
        />
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}
