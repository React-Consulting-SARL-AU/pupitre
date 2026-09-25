import { Button } from "@renderer/components/ui/button";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { Section } from "@renderer/components/ui/section";
import { useTranslations } from "@renderer/i18n/use-translations";
import { accountOf, useAccount } from "@renderer/stores/account";
import {
  dismissedGrants,
  grantedServers,
  unreachableGrants,
  useFleet,
} from "@renderer/stores/fleet";
import { Undo2 } from "lucide-react";
import { useEffect } from "react";
import { FleetOrganizations } from "./fleet-organizations";

export function FleetPanel({
  silentWhenEmpty = false,
}: {
  /** In the wizard, "nothing granted" would stand in the way of adding a machine. */
  silentWhenEmpty?: boolean;
} = {}) {
  const t = useTranslations();

  const view = useAccount((store) => store.view);
  const readAccount = useAccount((store) => store.read);

  const state = useFleet((store) => store.state);
  const read = useFleet((store) => store.read);
  const restore = useFleet((store) => store.restore);

  const account = accountOf(view);
  const identity = account?.identity ?? null;

  useEffect(() => {
    readAccount();
  }, [readAccount]);

  // Only the first read: the heartbeat that follows the platform lives above the screens.
  useEffect(() => {
    if (identity) {
      read();
    }
  }, [identity, read]);

  if (!(account && identity)) {
    return null;
  }

  const servers = grantedServers(state);
  const unreachable = unreachableGrants(state);
  const dismissed = dismissedGrants(state).length;
  const several = identity.organizations.length > 1;
  const failed = state.status === "failed";
  const nothingGranted =
    state.status === "read" &&
    servers.length === 0 &&
    dismissed === 0 &&
    unreachable === 0 &&
    !silentWhenEmpty &&
    identity.role !== "owner";

  const notes = failed || nothingGranted || dismissed > 0 || unreachable > 0;

  if (!(several || notes)) {
    return null;
  }

  return (
    <>
      <FleetOrganizations identity={identity} />

      {notes ? (
        <Section name="grants" title={t("fleet.grants.title")}>
          {state.status === "failed" ? (
            <ErrorNotice error={state.error} onRetry={read} />
          ) : null}

          {nothingGranted ? (
            <p className="text-ink-3 text-small leading-relaxed">
              {t("fleet.empty.detail")}
            </p>
          ) : null}

          {dismissed > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-ink-3 text-small leading-relaxed">
                {t.plural("fleet.dismissed", dismissed)}
              </p>
              <Button
                icon={Undo2}
                onClick={restore}
                size="sm"
                variant="discreet"
              >
                {t("fleet.restore")}
              </Button>
            </div>
          ) : null}

          {unreachable > 0 ? (
            <p className="text-ink-3 text-small leading-relaxed">
              {t.plural("fleet.noAddress", unreachable)}
            </p>
          ) : null}
        </Section>
      ) : null}
    </>
  );
}
