import type { Service } from "@pupitre/shared/agent-protocol/state";
import type { Manifest } from "@pupitre/shared/catalog";
import { Button } from "@renderer/components/ui/button";
import { EmptyState } from "@renderer/components/ui/empty-state";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { Panel } from "@renderer/components/ui/panel";
import { Screen } from "@renderer/components/ui/screen";
import { ModuleUpgradePanel } from "@renderer/components/updates/module-upgrade-panel";
import { useTranslations } from "@renderer/i18n/use-translations";
import { heldForUsage } from "@renderer/lib/refusals";
import { useServiceAccounts } from "@renderer/lib/use-service-accounts";
import { ofServer, useAgentUpdate } from "@renderer/stores/agent-update";
import { useCatalog } from "@renderer/stores/catalog";
import { useServices } from "@renderer/stores/services";
import { useTunnel } from "@renderer/stores/tunnel";
import { Boxes, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { ServicePanel } from "./service-panel";
import { ServicesAddFlow } from "./services-add-flow";
import { ServicesList } from "./services-list";
import { ServicesTunnel } from "./services-tunnel";

export function ServicesScreen({
  serverId,
  serverName,
  services,
  service,
  onOpenService,
  onCloseService,
  startAdding = false,
}: {
  serverId: string;
  serverName?: string;
  services: readonly Service[];
  service: string | null;
  onOpenService: (moduleId: string) => void;
  onCloseService: () => void;
  startAdding?: boolean;
}) {
  const t = useTranslations();

  const [adding, setAdding] = useState(startAdding);

  const catalog = useCatalog((state) => state.catalog);
  const modules = useCatalog((state) => state.modules);
  const loadCatalog = useCatalog((state) => state.load);

  const tunnel = useTunnel();
  const update = useAgentUpdate();
  const closePanel = useServices((state) => state.close);

  const installed = services.map((service) => service.id);
  const key = installed.join(" ");

  // Re-read whenever the list shows again: signing in happens on a service's page.
  const accounts = useServiceAccounts(
    serverId,
    services,
    service === null && !adding
  );

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

  // Closed on unmount so every way out (button, arrows, sidebar) drops the values.
  useEffect(() => {
    if (!service) {
      return;
    }

    return () => {
      closePanel(serverId);
    };
  }, [serverId, service, closePanel]);

  const moduleUpgrade = ofServer(update.modules, serverId);

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
      eyebrow={serverName ?? t("services.screen.fallbackName")}
      title={t("services.screen.title")}
    >
      {/* A usage hold is already announced at the top of the window. */}
      {catalog.status === "failed" && !heldForUsage(catalog.error) ? (
        <ErrorNotice
          error={catalog.error}
          onRetry={() => loadCatalog(serverId, installed)}
        />
      ) : null}

      {tunnel.problem && !heldForUsage(tunnel.problem) ? (
        <ErrorNotice error={tunnel.problem} />
      ) : null}

      <ModuleUpgradePanel
        modules={installed}
        nameOf={nameOf}
        onUpgrade={() => update.upgradeModules(serverId, installed)}
        state={moduleUpgrade}
        steps={moduleUpgrade.status === "idle" ? [] : update.steps}
      >
        {services.length === 0 ? (
          <Panel inset="none">
            <EmptyState
              action={
                <Button icon={Plus} onClick={() => setAdding(true)}>
                  {t("services.screen.add")}
                </Button>
              }
              icon={Boxes}
              title={t("services.screen.emptyTitle")}
            />
          </Panel>
        ) : (
          <ServicesList
            accounts={accounts}
            onOpen={onOpenService}
            services={services}
          />
        )}
      </ModuleUpgradePanel>

      {tunnel.tunnel.status === "ready" && !tunnel.tunnel.tunnel.installed ? (
        <ServicesTunnel />
      ) : null}
    </Screen>
  );
}
