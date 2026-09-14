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
  actions,
  plain,
  onConfigure,
}: {
  serverId: string;
  serverName?: string;
  /** What the header offers on the whole sequence: a way out of it. */
  actions?: ReactNode;
  /** The header sits on the page, as the onboarding's steps read theirs. */
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
    // A catalogue already read for this server is kept: coming back from the
    // configuration, or from an onboarding taken up again, must not throw away
    // the choice that was made under it.
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
          onRetry={() => load(serverId)}
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
        <ActionBar
          name="catalog"
          note={t.plural("catalog.screen.chosen", selected.length)}
        >
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
