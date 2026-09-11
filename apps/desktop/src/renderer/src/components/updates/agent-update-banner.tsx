import { InstallLog } from "@renderer/components/install/install-log";
import { Button } from "@renderer/components/ui/button";
import { Callout } from "@renderer/components/ui/callout";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { useTranslations } from "@renderer/i18n/use-translations";
import type {
  MigrationState,
  UpdateState,
  UpgradeState,
} from "@renderer/stores/agent-update";
import { owesMigration } from "@shared/agent-update";
import { ArrowUp } from "lucide-react";
import { AgentUpdateFrame } from "./agent-update-frame";
import { AgentUpdateNotes } from "./agent-update-notes";
import { ConfigMigrationPanel } from "./config-migration-panel";

/**
 * The gap between the agent this app can offer and the one the server runs.
 *
 * Ahead, it offers the update and the notes that came with it. Behind, it says
 * so and stops there: the server runs a newer agent, everything this app still
 * knows how to ask goes on working, and barring the screens over a version
 * number would break the app rather than the mismatch. Too far behind — a
 * generation of protocol away — nothing can be asked of that agent any more,
 * and the banner says which gesture repairs it.
 *
 * A configuration that is not the shape its agent reads comes before all of
 * that: nothing can be driven on such a server, so no version gap is worth
 * showing until it is settled.
 */
/**
 * The revision the configuration reached, when the migration that followed the
 * upgrade actually had something to carry over. An agent from before the ledger
 * says nothing, and neither does one that was already where it belongs.
 */
function migrated(upgrade: UpgradeState): number | null {
  if (upgrade.status !== "done") {
    return null;
  }

  const migration = upgrade.result.migration;

  return migration && migration.applied.length > 0 ? migration.revision : null;
}

export function AgentUpdateBanner({
  state,
  upgrade,
  migration,
  journal,
  onUpgrade,
  onMigrate,
  onHide,
}: {
  state: UpdateState;
  upgrade: UpgradeState;
  migration: MigrationState;
  journal: readonly string[];
  onUpgrade: () => void;
  onMigrate: () => void;
  onHide: () => void;
}) {
  const t = useTranslations();

  if (state.status !== "ready") {
    return null;
  }

  const { config, floor, installed, offer, order, platform, verdict } =
    state.update;

  if (config && owesMigration(config)) {
    return (
      <ConfigMigrationPanel
        agentVersion={installed}
        config={config}
        migration={migration}
        onMigrate={onMigrate}
      />
    );
  }

  if (verdict === "agent_too_old") {
    return (
      <AgentUpdateFrame
        detail={t("updates.agent.staleDetail", {
          floor: floor ?? "?",
          installed: installed ?? "?",
        })}
        onHide={onHide}
        order="behind"
        title={t("updates.agent.staleTitle")}
      >
        <Callout>{t("updates.agent.staleBody")}</Callout>
      </AgentUpdateFrame>
    );
  }

  if (order === "behind") {
    return (
      <AgentUpdateFrame
        detail={t("updates.agent.behindDetail", {
          installed: installed ?? "?",
          offered: offer?.version ?? "?",
        })}
        onHide={onHide}
        order={order}
        title={t("updates.agent.behindTitle")}
      >
        <Callout>{t("updates.agent.behindBody")}</Callout>
      </AgentUpdateFrame>
    );
  }

  if (!(order === "ahead" && offer)) {
    return null;
  }

  const signable = offer.signed || platform;
  const revision = migrated(upgrade);

  return (
    <AgentUpdateFrame
      detail={`pupitred ${installed ?? "?"} → ${offer.version} · ${offer.arch}`}
      onHide={onHide}
      order={order}
      title={t("updates.agent.aheadTitle")}
    >
      <AgentUpdateNotes notes={offer.notes} />

      {signable ? null : (
        <Callout fix={t("updates.agent.unsignedFix")} tone="warn">
          {t("updates.agent.unsignedBody")}
        </Callout>
      )}

      {upgrade.status === "failed" ? (
        <ErrorNotice error={upgrade.error} onRetry={onUpgrade} />
      ) : null}

      {upgrade.status === "done" ? (
        <Callout>
          {upgrade.result.upgrade.restarting
            ? t("updates.agent.upgradedRestarted", {
                previous: upgrade.result.upgrade.previous_version,
                version: upgrade.result.upgrade.version,
              })
            : t("updates.agent.upgraded", {
                previous: upgrade.result.upgrade.previous_version,
                version: upgrade.result.upgrade.version,
              })}
        </Callout>
      ) : null}

      {revision === null ? null : (
        <Callout>{t("updates.config.migrated", { revision })}</Callout>
      )}

      <InstallLog lines={journal} />

      <div className="flex justify-end">
        <Button
          disabled={!signable}
          icon={ArrowUp}
          loading={upgrade.status === "running"}
          onClick={onUpgrade}
          variant="inverse"
        >
          {t("updates.agent.upgradeButton")}
        </Button>
      </div>
    </AgentUpdateFrame>
  );
}
