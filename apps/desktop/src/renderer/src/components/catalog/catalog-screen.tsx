import { useTranslations } from "@renderer/i18n/use-translations";
import { ArrowRight } from "lucide-react";
import { useEffect } from "react";
import { STEP_COLUMN } from "../../lib/layout";
import { useCatalog } from "../../stores/catalog";
import { probeOf } from "../../stores/inspection";
import { ActionBar } from "../ui/action-bar";
import { Button } from "../ui/button";
import { StepFailure } from "../ui/step-failure";
import { StepHeading } from "../ui/step-heading";
import { WaitingNotice } from "../ui/waiting-notice";
import { CatalogChoice } from "./catalog-choice";

/**
 * What to install on this server, read from the agent's own catalogue.
 *
 * The screen asks `catalog` and draws the answer. It weighs the selection
 * against the report the probe left behind on the previous screen, which is why
 * a machine that was never inspected simply gets no warning rather than a
 * guessed one. The screen ends on the gesture, with the count beside it.
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
    // A catalogue already read for this server is kept: coming back from the
    // configuration, or from an onboarding taken up again, must not throw away
    // the choice that was made under it.
    const held = useCatalog.getState().catalog;

    if (held.status !== "idle" && held.serverId === serverId) {
      return;
    }

    load(serverId, probeOf(serverId)?.installed_modules ?? []);
  }, [serverId, load]);

  const header = (
    <StepHeading
      description={t("catalog.screen.description")}
      eyebrow={t("catalog.screen.eyebrow")}
      step="catalog"
      title={serverName ?? t("catalog.screen.defaultServer")}
    />
  );

  if (catalog.status === "failed" && catalog.serverId === serverId) {
    return (
      <section className={`${STEP_COLUMN} flex flex-col gap-section`}>
        {header}
        <StepFailure
          error={catalog.error}
          onRetry={() => load(serverId)}
          retryLabel={t("catalog.screen.reload")}
        />
      </section>
    );
  }

  if (catalog.status !== "ready" || catalog.serverId !== serverId) {
    return (
      <section className={`${STEP_COLUMN} flex flex-col gap-section`}>
        {header}
        <WaitingNotice
          detail={t("catalog.screen.waitingDetail")}
          title={t("catalog.screen.waitingTitle")}
        />
      </section>
    );
  }

  return (
    <section className="flex flex-1 flex-col">
      <div className={`${STEP_COLUMN} flex flex-1 flex-col gap-section pb-6`}>
        {header}

        <CatalogChoice
          blocked={unreachable()}
          catalog={catalog.catalog}
          onPreset={usePreset}
          onToggle={toggle}
          probe={probeOf(serverId)}
          selected={selected}
          warnings={warnings()}
        />
      </div>

      <ActionBar
        name="catalog"
        note={t.plural("catalog.screen.chosen", selected.length)}
      >
        <Button icon={ArrowRight} onClick={onConfigure} variant="inverse">
          {t.plural("catalog.screen.configure", selected.length)}
        </Button>
      </ActionBar>
    </section>
  );
}
