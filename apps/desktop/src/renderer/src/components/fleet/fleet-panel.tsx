import { EmptyState } from "@renderer/components/ui/empty-state";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { Label } from "@renderer/components/ui/label";
import { WaitingNotice } from "@renderer/components/ui/waiting-notice";
import { useTranslations } from "@renderer/i18n/use-translations";
import { accountOf, useAccount } from "@renderer/stores/account";
import {
  grantedServers,
  unreachableGrants,
  useFleet,
} from "@renderer/stores/fleet";
import { Users } from "lucide-react";
import { useEffect } from "react";
import { FleetOrganizations } from "./fleet-organizations";
import { FleetServerRow } from "./fleet-server-row";

/**
 * The servers your organization gave you, above the ones you added yourself.
 *
 * The list is read again on a beat because an assignment lands while the app
 * is open, and because the key the platform pushes is what turns a waiting
 * server into one that opens.
 */

const POLL_MS = 10_000;

export function FleetPanel() {
  const t = useTranslations();

  const view = useAccount((store) => store.view);
  const readAccount = useAccount((store) => store.read);

  const state = useFleet((store) => store.state);
  const opening = useFleet((store) => store.opening);
  const read = useFleet((store) => store.read);
  const open = useFleet((store) => store.open);

  const account = accountOf(view);
  const identity = account?.identity ?? null;

  useEffect(() => {
    readAccount();
  }, [readAccount]);

  useEffect(() => {
    if (!identity) {
      return;
    }

    read();

    const beat = setInterval(read, POLL_MS);

    return () => clearInterval(beat);
  }, [identity, read]);

  if (!(account && identity)) {
    return null;
  }

  const servers = grantedServers(state);
  const unreachable = unreachableGrants(state);

  return (
    <section className="flex flex-col gap-4">
      <div>
        <Label>{t("fleet.heading")}</Label>
        <p className="mt-1 text-ink-3 leading-relaxed">{t("fleet.intro")}</p>
      </div>

      <FleetOrganizations consoleUrl={account.consoleUrl} identity={identity} />

      {state.status === "reading" ? (
        <WaitingNotice
          detail={t("fleet.reading.detail")}
          title={t("fleet.reading.title")}
        />
      ) : null}

      {state.status === "failed" ? (
        <ErrorNotice error={state.error} onRetry={read} />
      ) : null}

      {state.status === "read" && servers.length === 0 ? (
        <div className="rounded-md border border-line border-dashed">
          <EmptyState
            detail={t("fleet.empty.detail")}
            icon={Users}
            title={t("fleet.empty.title")}
          />
        </div>
      ) : null}

      {servers.map((server) => (
        <FleetServerRow
          key={server.id}
          onOpen={() => open(server.id)}
          opening={
            opening.status !== "idle" && opening.serverId === server.id
              ? opening
              : null
          }
          server={server}
        />
      ))}

      {unreachable > 0 ? (
        <p className="text-[11px] text-ink-4 leading-relaxed">
          {t.plural("fleet.noAddress", unreachable)}
        </p>
      ) : null}
    </section>
  );
}
