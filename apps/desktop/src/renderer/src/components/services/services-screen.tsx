import type { Service } from "@pupitre/shared/agent-protocol/state";
import type { Manifest } from "@pupitre/shared/catalog";
import { Button } from "@renderer/components/ui/button";
import { EmptyState } from "@renderer/components/ui/empty-state";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { PageHeader } from "@renderer/components/ui/page-header";
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
 * here. Opening one goes to its own page; adding one goes back through the
 * catalogue, the configuration and the report of the onboarding, unchanged.
 */

type View =
  | { kind: "list" }
  | { kind: "service"; moduleId: string }
  | { kind: "add" };

export function ServicesScreen({
  serverId,
  serverName,
  services,
  onMachineName,
  onTerminal,
}: {
  serverId: string;
  serverName?: string;
  services: readonly Service[];
  onMachineName?: (name: string) => void;
  onTerminal?: () => void;
}) {
  const [view, setView] = useState<View>({ kind: "list" });

  const catalog = useCatalog((state) => state.catalog);
  const modules = useCatalog((state) => state.modules);
  const loadCatalog = useCatalog((state) => state.load);

  const tunnel = useTunnel();
  const closePanel = useServices((state) => state.close);

  const installed = services.map((service) => service.id);
  const key = installed.join(" ");

  // The add flow loads the catalogue itself, and a catalogue already read for
  // this machine and these modules is the same answer twice.
  useEffect(() => {
    const state = useCatalog.getState();
    const read =
      state.catalog.status === "ready" &&
      state.catalog.serverId === serverId &&
      state.installed.join(" ") === key;

    if (view.kind === "add" || read) {
      return;
    }

    loadCatalog(serverId, key.length > 0 ? key.split(" ") : []);
  }, [serverId, key, loadCatalog, view.kind]);

  const { read: readTunnel } = tunnel;

  useEffect(() => {
    readTunnel(serverId);
  }, [serverId, readTunnel]);

  function manifestsOf(): Manifest[] {
    return modules().filter((manifest) => installed.includes(manifest.id));
  }

  async function back(): Promise<void> {
    await closePanel(serverId);
    setView({ kind: "list" });
  }

  if (view.kind === "add") {
    return (
      <div className="h-full overflow-y-auto px-8 py-6">
        <ServicesAddFlow
          installed={installed}
          machineName={serverName ?? ""}
          onDone={() => setView({ kind: "list" })}
          onMachineName={onMachineName}
          serverId={serverId}
          serverName={serverName}
        />
      </div>
    );
  }

  if (view.kind === "service") {
    return (
      <div className="h-full overflow-y-auto px-8 py-6">
        <ServicePanel
          installed={manifestsOf()}
          manifest={
            modules().find((manifest) => manifest.id === view.moduleId) ?? null
          }
          moduleId={view.moduleId}
          onBack={back}
          onTerminal={onTerminal}
          serverId={serverId}
        />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-8 py-6">
      <section className="flex flex-col gap-8">
        <PageHeader
          actions={
            <Button
              icon={Plus}
              onClick={() => setView({ kind: "add" })}
              variant="inverse"
            >
              Ajouter un module
            </Button>
          }
          description="Ce que l'agent a installé sur cette machine, et ce qu'il en dit."
          eyebrow="Services"
          title={serverName ?? "Ce serveur"}
        />

        {catalog.status === "failed" ? (
          <ErrorNotice
            error={catalog.error}
            onRetry={() => loadCatalog(serverId, installed)}
          />
        ) : null}

        {tunnel.problem ? <ErrorNotice error={tunnel.problem} /> : null}

        {services.length === 0 ? (
          <EmptyState
            action={
              <Button icon={Plus} onClick={() => setView({ kind: "add" })}>
                Ajouter un module
              </Button>
            }
            detail="L'agent n'a installé aucun module sur cette machine."
            icon={Boxes}
            title="Aucun service"
          />
        ) : (
          <ul className="elevation-raised divide-y divide-line rounded-md border border-line bg-surface">
            {services.map((service) => (
              <ServiceRow
                key={service.id}
                onOpen={() =>
                  setView({ kind: "service", moduleId: service.id })
                }
                service={service}
              />
            ))}
          </ul>
        )}

        {tunnel.tunnel.status === "ready" ? (
          <ServicesTunnel
            busy={tunnel.busy}
            onRestart={() => tunnel.restart(serverId)}
            onSync={() => tunnel.sync(serverId)}
            tunnel={tunnel.tunnel.tunnel}
          />
        ) : null}
      </section>
    </div>
  );
}
