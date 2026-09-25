import { useTranslations } from "@renderer/i18n/use-translations";
import { ArrowRight } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useCatalog } from "../../stores/catalog";
import { probeOf } from "../../stores/inspection";
import { ActionBar } from "../ui/action-bar";
import { Button } from "../ui/button";
import { Screen } from "../ui/screen";
import { StepFailure } from "../ui/step-failure";
import { WaitingNotice } from "../ui/waiting-notice";
import { CatalogChoice } from "./catalog-choice";

export function CatalogScreen({
  serverId,
  serverName,
  actions,
  plain,
  onConfigure,
}: {
  serverId: string;
  serverName?: string;
  actions?: ReactNode;
  plain?: boolean;
  onConfigure?: () => void;
}) {
  const t = useTranslations();

  const [query, setQuery] = useState("");

  const catalog = useCatalog((state) => state.catalog);
  const selected = useCatalog((state) => state.selected);
  const load = useCatalog((state) => state.load);
  const toggle = useCatalog((state) => state.toggle);
  const usePreset = useCatalog((state) => state.usePreset);
  const unreachable = useCatalog((state) => state.unreachable);
  const warnings = useCatalog((state) => state.warnings);
  const installed = useCatalog((state) => state.installed);

  useEffect(() => {
    // Reloading would throw away the selection made under the catalogue already read.
    const held = useCatalog.getState().catalog;

    if (held.status !== "idle" && held.serverId === serverId) {
      return;
    }

    load(serverId, probeOf(serverId)?.installed_modules ?? []);
  }, [serverId, load]);

  const frame = {
    actions,
    column: true,
    plain,
    eyebrow: serverName ?? t("catalog.screen.defaultServer"),
    step: "catalog",
    title: t("catalog.screen.title"),
  };

  if (catalog.status === "failed" && catalog.serverId === serverId) {
    return (
      <Screen {...frame}>
        <StepFailure
          error={catalog.error}
          onRetry={() => load(serverId, installed)}
          retryLabel={t("catalog.screen.reload")}
        />
      </Screen>
    );
  }

  if (catalog.status !== "ready" || catalog.serverId !== serverId) {
    return (
      <Screen {...frame}>
        <WaitingNotice title={t("catalog.screen.waitingTitle")} />
      </Screen>
    );
  }

  return (
    <Screen
      {...frame}
      footer={
        <ActionBar name="catalog">
          <Button icon={ArrowRight} onClick={onConfigure} variant="inverse">
            {t.plural("catalog.screen.configure", selected.length)}
          </Button>
        </ActionBar>
      }
    >
      <CatalogChoice
        blocked={unreachable()}
        catalog={catalog.catalog}
        installed={installed}
        onPreset={usePreset}
        onQuery={setQuery}
        onToggle={toggle}
        probe={probeOf(serverId)}
        query={query}
        selected={selected}
        warnings={warnings()}
      />
    </Screen>
  );
}
