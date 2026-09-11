import type { ConfigRevision } from "@pupitre/shared/agent-protocol/migrate";
import { Button } from "@renderer/components/ui/button";
import { Callout } from "@renderer/components/ui/callout";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { MigrationState } from "@renderer/stores/agent-update";
import { ArrowUp } from "lucide-react";
import { AgentUpdateFrame } from "./agent-update-frame";

/**
 * The configuration on the server, against the agent that reads it.
 *
 * The agent migrates itself when it starts, so this panel is what a reader sees
 * when that did not go through. Nothing can be driven on the server meanwhile —
 * the agent refuses on its own — so there is no way to put this away, only a
 * second attempt and, when the refusal keeps coming, the sentence the agent
 * wrote about it.
 */
export function ConfigMigrationPanel({
  config,
  agentVersion,
  migration,
  onMigrate,
}: {
  config: ConfigRevision;
  agentVersion: string | null;
  migration: MigrationState;
  onMigrate: () => void;
}) {
  const t = useTranslations();

  if (config.state === "ahead") {
    return (
      <AgentUpdateFrame
        detail={t("updates.config.pendingDetail", {
          agent: agentVersion ?? "?",
          expected: config.expected,
          revision: config.revision,
        })}
        order="behind"
        title={t("updates.config.aheadTitle")}
      >
        <Callout tone="warn">{t("updates.config.aheadBody")}</Callout>
      </AgentUpdateFrame>
    );
  }

  const failure =
    migration.status === "done" ? (migration.result?.failure ?? null) : null;

  return (
    <AgentUpdateFrame
      detail={t("updates.config.pendingDetail", {
        agent: agentVersion ?? "?",
        expected: config.expected,
        revision: config.revision,
      })}
      order="behind"
      title={
        config.state === "failed"
          ? t("updates.config.failedTitle")
          : t("updates.config.pendingTitle")
      }
    >
      <Callout tone="warn">{t("updates.config.pendingBody")}</Callout>

      {failure ? (
        <Callout tone="warn">
          {t("updates.config.failedBody", {
            id: failure.id,
            message: failure.message,
            slug: failure.slug,
          })}
        </Callout>
      ) : null}

      {migration.status === "done" && migration.result?.restored ? (
        <Callout>{t("updates.config.restored")}</Callout>
      ) : null}

      {migration.status === "failed" ? (
        <ErrorNotice error={migration.error} onRetry={onMigrate} />
      ) : null}

      <div className="flex justify-end">
        <Button
          icon={ArrowUp}
          loading={migration.status === "running"}
          onClick={onMigrate}
          variant="inverse"
        >
          {t("updates.config.migrateButton")}
        </Button>
      </div>
    </AgentUpdateFrame>
  );
}
