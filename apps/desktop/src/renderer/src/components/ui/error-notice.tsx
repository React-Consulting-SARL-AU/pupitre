import { agentText } from "@renderer/i18n/agent-error";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { AgentError } from "@shared/agent";
import { RotateCw } from "lucide-react";
import { Button } from "./button";
import { Callout } from "./callout";

/**
 * What the agent refused, in its own words.
 *
 * `message` and `fix` are printed as they arrived: a remedy rewritten here
 * would describe the machine we imagine rather than the one that answered. The
 * button is what replays the command, when replaying it makes sense.
 */
export function ErrorNotice({
  error,
  onRetry,
  retryLabel,
}: {
  error: AgentError;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  const t = useTranslations();

  return (
    <Callout
      action={
        onRetry ? (
          <Button icon={RotateCw} onClick={onRetry} size="sm">
            {retryLabel ?? t("common.retry")}
          </Button>
        ) : null
      }
      fix={agentText(t, error).fix}
      tone="danger"
    >
      {agentText(t, error).message}
    </Callout>
  );
}
