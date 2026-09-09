import { agentText } from "@renderer/i18n/agent-error";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { Gesture } from "@renderer/lib/use-pending";
import type { AgentError } from "@shared/agent";
import { RotateCw } from "lucide-react";
import { Button } from "./button";
import { Callout } from "./callout";

/**
 * What the agent refused, in its own words.
 *
 * `message` and `fix` are printed as they arrived: a remedy rewritten here
 * would describe the machine we imagine rather than the one that answered. The
 * button is what replays the command, when replaying it makes sense, and it
 * waits on the replay so the reader sees it was heard.
 */
export function ErrorNotice({
  error,
  onRetry,
  retryLabel,
  onDismiss,
  name,
}: {
  error: AgentError;
  /** Answer with the promise of the replay and the button waits on it. */
  onRetry?: Gesture;
  retryLabel?: string;
  onDismiss?: () => void;
  name?: string;
}) {
  const t = useTranslations();

  const said = agentText(t, error);

  return (
    <Callout
      action={
        onRetry ? (
          <Button icon={RotateCw} onClick={onRetry} size="sm">
            {retryLabel ?? t("common.retry")}
          </Button>
        ) : null
      }
      fix={said.fix}
      name={name ?? error.code}
      onDismiss={onDismiss}
      tone="danger"
    >
      {said.message}
    </Callout>
  );
}
