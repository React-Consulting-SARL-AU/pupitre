import { Button } from "@renderer/components/ui/button";
import { EmptyState } from "@renderer/components/ui/empty-state";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { Label } from "@renderer/components/ui/label";
import { SkeletonRows } from "@renderer/components/ui/skeleton";
import { useTranslations } from "@renderer/i18n/use-translations";
import { accountOf, useAccount } from "@renderer/stores/account";
import {
  dismissedGrants,
  fleetGroups,
  grantedServers,
  unreachableGrants,
  useFleet,
} from "@renderer/stores/fleet";
import { Undo2, Users } from "lucide-react";
import { useEffect } from "react";
import { FleetOrganizations } from "./fleet-organizations";
import { FleetServerRow } from "./fleet-server-row";

/**
 * The servers your organization gave you, above the ones you added yourself.
 *
 * The list refreshes itself: the heartbeat that follows the platform lives
 * above the screens, because a grant lands while the app is open and the pushed
 * key is what turns a pending server into one that opens.
 */

export function FleetPanel({
  silentWhenEmpty = false,
}: {
  /**
   * Say nothing as long as the organization grants nothing.
   *
   * A "no server is granted to you" card is information in the settings, and
   * an obstacle in the wizard: there, what has to be possible when nothing is
   * granted is adding a machine.
   */
  silentWhenEmpty?: boolean;
} = {}) {
  const t = useTranslations();

  const view = useAccount((store) => store.view);
  const readAccount = useAccount((store) => store.read);

  const state = useFleet((store) => store.state);
  const opening = useFleet((store) => store.opening);
  const read = useFleet((store) => store.read);
  const open = useFleet((store) => store.open);
  const restore = useFleet((store) => store.restore);

  const account = accountOf(view);
  const identity = account?.identity ?? null;

  useEffect(() => {
    readAccount();
  }, [readAccount]);

  // The heartbeat that follows the platform lives above the screens; this
  // panel only asks for a first read when it opens.
  useEffect(() => {
    if (identity) {
      read();
    }
  }, [identity, read]);

  if (!(account && identity)) {
    return null;
  }

  const servers = grantedServers(state);
  const groups = fleetGroups(state);
  const named = groups.length > 1;
  const unreachable = unreachableGrants(state);
  const dismissed = dismissedGrants(state).length;
  const empty = servers.length === 0 && dismissed === 0 && unreachable === 0;

  if (silentWhenEmpty && empty && state.status !== "failed") {
    return null;
  }

  return (
    <section className="flex flex-col gap-4">
      <div>
        <Label>{t("fleet.heading")}</Label>
        <p className="mt-1 text-ink-3 leading-relaxed">{t("fleet.intro")}</p>
      </div>

      <FleetOrganizations identity={identity} />

      {state.status === "reading" ? <SkeletonRows rows={2} /> : null}

      {state.status === "failed" ? (
        <ErrorNotice error={state.error} onRetry={read} />
      ) : null}

      {state.status === "read" && servers.length === 0 && !silentWhenEmpty ? (
        <div className="rounded-md border border-line border-dashed">
          <EmptyState
            detail={t("fleet.empty.detail")}
            icon={Users}
            title={t("fleet.empty.title")}
          />
        </div>
      ) : null}

      {groups.map((group) => (
        <div className="flex flex-col gap-4" key={group.id}>
          {named && group.name ? <Label>{group.name}</Label> : null}

          {group.servers.map((server) => (
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
        </div>
      ))}

      {dismissed > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[12px] text-ink-3 leading-relaxed">
            {t.plural("fleet.dismissed", dismissed)}
          </p>
          <Button icon={Undo2} onClick={restore} size="sm" variant="discreet">
            {t("fleet.restore")}
          </Button>
        </div>
      ) : null}

      {unreachable > 0 ? (
        <p className="text-[12px] text-ink-3 leading-relaxed">
          {t.plural("fleet.noAddress", unreachable)}
        </p>
      ) : null}
    </section>
  );
}
