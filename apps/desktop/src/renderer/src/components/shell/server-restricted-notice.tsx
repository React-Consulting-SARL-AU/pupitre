import type { SnapshotResult } from "@pupitre/shared/agent-protocol/state";
import { Button } from "@renderer/components/ui/button";
import { Callout } from "@renderer/components/ui/callout";
import { useTranslations } from "@renderer/i18n/use-translations";
import { ExternalLink } from "lucide-react";

/**
 * What the agent says of its own right to work.
 *
 * It is the server's own answer, not the account's: this computer may be
 * signed in and this machine still be suspended. A restricted agent keeps
 * everything running and answers six commands, so the screen stays readable
 * and says once, at the top, why every button below would refuse.
 */
export function ServerRestrictedNotice({
  entitlement,
  onOpenConsole,
}: {
  entitlement: SnapshotResult["entitlement"];
  onOpenConsole: () => void;
}) {
  const t = useTranslations();

  if (entitlement !== "restricted") {
    return null;
  }

  return (
    <div className="clickable shrink-0 px-4 pt-2">
      <Callout
        action={
          <Button icon={ExternalLink} onClick={onOpenConsole} size="sm">
            {t("shell.restricted.console")}
          </Button>
        }
        fix={t("shell.restricted.fix")}
        tone="danger"
      >
        {t("shell.restricted.message")}
      </Callout>
    </div>
  );
}
