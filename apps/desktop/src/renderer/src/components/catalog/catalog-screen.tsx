import { useTranslations } from "@renderer/i18n/use-translations";
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
  const t = useTranslations();

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
      description={t("catalog.screen.description")}
      eyebrow={t("catalog.screen.eyebrow")}
      title={serverName ?? t("catalog.screen.defaultServer")}
    />
  );

  if (catalog.status === "failed" && catalog.serverId === serverId) {
    return (
      <section className="flex flex-col gap-section">
        {header}
        <Callout
          action={
            <Button icon={RefreshCw} onClick={() => load(serverId)}>
              {t("catalog.screen.reload")}
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
      <section className="flex flex-col gap-section">
        {header}
        <WaitingNotice
          detail={t("catalog.screen.waitingDetail")}
          title={t("catalog.screen.waitingTitle")}
        />
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-section">
      <PageHeader
        actions={
          <Button icon={ArrowRight} onClick={onConfigure} variant="inverse">
            {t("catalog.screen.configure", { count: selected.length })}
          </Button>
        }
        description={t("catalog.screen.description")}
        eyebrow={t("catalog.screen.eyebrow")}
        title={serverName ?? t("catalog.screen.defaultServer")}
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
