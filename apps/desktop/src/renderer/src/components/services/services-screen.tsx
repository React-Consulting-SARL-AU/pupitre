import type { Service } from "@pupitre/shared/agent-protocol/state";
import type { Manifest } from "@pupitre/shared/catalog";
import { Button } from "@renderer/components/ui/button";
import { EmptyState } from "@renderer/components/ui/empty-state";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { Screen } from "@renderer/components/ui/screen";
import { ModuleUpgradePanel } from "@renderer/components/updates/module-upgrade-panel";
import { useTranslations } from "@renderer/i18n/use-translations";
import { heldForUsage } from "@renderer/lib/refusals";
import { useServiceAccounts } from "@renderer/lib/use-service-accounts";
import { useAgentUpdate } from "@renderer/stores/agent-update";
import { useCatalog } from "@renderer/stores/catalog";
import { useServices } from "@renderer/stores/services";
import { useTunnel } from "@renderer/stores/tunnel";
import { Boxes, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { ServicePanel } from "./service-panel";
import { ServiceRow } from "./service-row";
import { ServicesAddFlow } from "./services-add-flow";
import { ServicesTunnel } from "./services-tunnel";

/**
 * The services of a server, once the onboarding is behind.
 *
 * The list is the snapshot's: a module the agent did not install is not a row
 * here. A service's own page is a place in the app's history, so "back" from
 * it lands on the list; adding one goes back through the catalogue, the
 * configuration and the report of the onboarding, unchanged.
 */

export function ServicesScreen({
  serverId,
  serverName,
  services,
  service,
  onOpenService,
  onCloseService,
}: {
  serverId: string;
  serverName?: string;
  services: readonly Service[];
  onMachineName?: (name: string) => void;
  /** The service whose page is open, or the list when none. */
  service: string | null;
  onOpenService: (moduleId: string) => void;
  onCloseService: () => void;
}) {
  const t = useTranslations();

  const [adding, setAdding] = useState(false);

  const catalog = useCatalog((state) => state.catalog);
  const modules = useCatalog((state) => state.modules);
  const loadCatalog = useCatalog((state) => state.load);

  const tunnel = useTunnel();
  const update = useAgentUpdate();
  const closePanel = useServices((state) => state.close);

  const installed = services.map((service) => service.id);
  const key = installed.join(" ");

  // Asked again each time the list comes back on screen: a fiche is where the
  // reader signs in, and the row has to say so on the way back.
  const accounts = useServiceAccounts(
    serverId,
    services,
    service === null && !adding
  );

  // The add flow loads the catalogue itself, and a catalogue already read for
  // this machine and these modules is the same answer twice.
  useEffect(() => {
    const state = useCatalog.getState();
    const read =
      state.catalog.status === "ready" &&
      state.catalog.serverId === serverId &&
      state.installed.join(" ") === key;

    if (adding || read) {
      return;
    }

    loadCatalog(serverId, key.length > 0 ? key.split(" ") : []);
  }, [serverId, key, loadCatalog, adding]);

  // The page is left by its own button, the arrows or the sidebar alike, and
  // the values it held go with it whichever way.
  useEffect(() => {
    if (!service) {
      return;
    }

    return () => {
      closePanel(serverId);
    };
  }, [serverId, service, closePanel]);

  const { read: readTunnel } = tunnel;

  useEffect(() => {
    readTunnel(serverId);
  }, [serverId, readTunnel]);

  function manifestsOf(): Manifest[] {
    return modules().filter((manifest) => installed.includes(manifest.id));
  }

  function nameOf(moduleId: string): string {
    return (
      services.find((service) => service.id === moduleId)?.name ??
      modules().find((manifest) => manifest.id === moduleId)?.name ??
      moduleId
    );
  }

  if (service) {
    return (
      <ServicePanel
        catalogHeld={heldForUsage(
          catalog.status === "failed" ? catalog.error : null
        )}
        installed={manifestsOf()}
        manifest={modules().find((manifest) => manifest.id === service) ?? null}
        moduleId={service}
        onBack={onCloseService}
        onReloadCatalog={() => loadCatalog(serverId, installed)}
        serverId={serverId}
        serverName={serverName ?? null}
      />
    );
  }

  if (adding) {
    return (
      <ServicesAddFlow
        installed={installed}
        onDone={() => setAdding(false)}
        serverId={serverId}
        serverName={serverName}
      />
    );
  }

  return (
    <Screen
      actions={
        <Button icon={Plus} onClick={() => setAdding(true)} variant="inverse">
          {t("services.screen.add")}
        </Button>
      }
      eyebrow={t("services.screen.eyebrow")}
      title={serverName ?? t("services.screen.fallbackName")}
    >
      {/*
          A server held for its usage right refuses the catalogue, the tunnel
          and every service with the same sentence; the notice at the top of
          the window already says it, and where to answer it.
        */}
      {catalog.status === "failed" && !heldForUsage(catalog.error) ? (
        <ErrorNotice
          error={catalog.error}
          onRetry={() => loadCatalog(serverId, installed)}
        />
      ) : null}

      {tunnel.problem && !heldForUsage(tunnel.problem) ? (
        <ErrorNotice error={tunnel.problem} />
      ) : null}

      {services.length === 0 ? (
        <EmptyState
          action={
            <Button icon={Plus} onClick={() => setAdding(true)}>
              {t("services.screen.add")}
            </Button>
          }
          icon={Boxes}
          title={t("services.screen.emptyTitle")}
        />
      ) : (
        <ul className="elevation-raised divide-y divide-line overflow-hidden rounded-md border border-line bg-surface">
          {services.map((service) => (
            <ServiceRow
              account={accounts[service.id]}
              key={service.id}
              onOpen={() => onOpenService(service.id)}
              service={service}
            />
          ))}
        </ul>
      )}

      {services.length > 0 ? (
        <ModuleUpgradePanel
          modules={installed}
          nameOf={nameOf}
          onUpgrade={() => update.upgradeModules(serverId, installed)}
          state={update.modules}
          steps={update.steps}
        />
      ) : null}

      {tunnel.tunnel.status === "ready" && !tunnel.tunnel.tunnel.installed ? (
        <ServicesTunnel />
      ) : null}
    </Screen>
  );
}
