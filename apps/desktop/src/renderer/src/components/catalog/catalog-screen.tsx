import { ArrowRight, RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { useCatalog } from "../../stores/catalog";
import { probeOf } from "../../stores/inspection";
import { Button } from "../ui/button";
import { Callout } from "../ui/callout";
import { PageHeader } from "../ui/page-header";
import { WaitingNotice } from "../ui/waiting-notice";
import { CatalogChoice } from "./catalog-choice";

/**
 * What to install on this server, read from the agent's own catalogue.
 *
 * The screen asks `catalog` and draws the answer. It weighs the selection
 * against the report the probe left behind on the previous screen, which is why
 * a machine that was never inspected simply gets no warning rather than a
 * guessed one.
 */
export function CatalogScreen({
  serverId,
  serverName,
  onConfigure,
}: {
  serverId: string;
  serverName?: string;
  onConfigure?: () => void;
}) {
  const catalog = useCatalog((state) => state.catalog);
  const selected = useCatalog((state) => state.selected);
  const load = useCatalog((state) => state.load);
  const toggle = useCatalog((state) => state.toggle);
  const usePreset = useCatalog((state) => state.usePreset);
  const unreachable = useCatalog((state) => state.unreachable);
  const warnings = useCatalog((state) => state.warnings);

  useEffect(() => {
    load(serverId);
  }, [serverId, load]);

  const header = (
    <PageHeader
      description="Le catalogue est celui de l'agent de ce serveur : ce qu'il déclare est ce qui s'affiche."
      eyebrow="Services"
      title={serverName ?? "Ce serveur"}
    />
  );

  if (catalog.status === "failed" && catalog.serverId === serverId) {
    return (
      <section className="flex flex-col gap-8">
        {header}
        <Callout
          action={
            <Button icon={RefreshCw} onClick={() => load(serverId)}>
              Relancer
            </Button>
          }
          fix={catalog.error.fix}
          tone="danger"
        >
          {catalog.error.message}
        </Callout>
      </section>
    );
  }

  if (catalog.status !== "ready" || catalog.serverId !== serverId) {
    return (
      <section className="flex flex-col gap-8">
        {header}
        <WaitingNotice
          detail="Modules disponibles, dépendances, conflits, ressources demandées, préréglages."
          title="Lecture du catalogue"
        />
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-8">
      <PageHeader
        actions={
          <Button icon={ArrowRight} onClick={onConfigure} variant="inverse">
            Configurer {selected.length} modules
          </Button>
        }
        description="Le catalogue est celui de l'agent de ce serveur : ce qu'il déclare est ce qui s'affiche."
        eyebrow="Services"
        title={serverName ?? "Ce serveur"}
      />

      <CatalogChoice
        blocked={unreachable()}
        catalog={catalog.catalog}
        onPreset={usePreset}
        onToggle={toggle}
        probe={probeOf(serverId)}
        selected={selected}
        warnings={warnings()}
      />
    </section>
  );
}
