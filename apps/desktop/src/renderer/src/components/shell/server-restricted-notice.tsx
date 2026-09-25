import type { SnapshotResult } from "@pupitre/shared/agent-protocol/state";
import { Button } from "@renderer/components/ui/button";
import { Callout } from "@renderer/components/ui/callout";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { ReenrollState } from "@renderer/stores/reenroll";
import { ExternalLink } from "lucide-react";
import { ServerReenrollAction } from "./server-reenroll-action";

export function ServerRestrictedNotice({
  entitlement,
  repair,
  repairable,
  onRepair,
  onOpenConsole,
}: {
  entitlement: SnapshotResult["entitlement"];
  repair: ReenrollState;
  /** Requires a usage right: without one the platform refuses the new token. */
  repairable: boolean;
  onRepair: () => void;
  onOpenConsole: () => void;
}) {
  const t = useTranslations();

  if (entitlement !== "restricted") {
    return null;
  }

  return (
    <div className="clickable flex shrink-0 flex-col gap-2 px-4 pt-2">
      <Callout
        action={
          <div className="flex items-center gap-2">
            {repairable ? (
              <ServerReenrollAction onRepair={onRepair} state={repair} />
            ) : null}
            <Button icon={ExternalLink} onClick={onOpenConsole} size="sm">
              {t("shell.restricted.console")}
            </Button>
          </div>
        }
        fix={t("shell.restricted.fix")}
        tone="danger"
      >
        {t("shell.restricted.message")}
      </Callout>

      {repair.status === "failed" ? (
        <ErrorNotice error={repair.error} onRetry={onRepair} />
      ) : null}
    </div>
  );
}
