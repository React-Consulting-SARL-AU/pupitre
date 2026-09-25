import { agentText } from "@renderer/i18n/agent-error";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { Gesture } from "@renderer/lib/use-pending";
import type { AgentError } from "@shared/agent";
import { RotateCw } from "lucide-react";
import { Button } from "./button";
import { Callout } from "./callout";

export function ErrorNotice({
  error,
  onRetry,
  retrying = false,
  retryLabel,
  onDismiss,
  name,
  bare = false,
}: {
  error: AgentError;
  onRetry?: Gesture;
  /** For a replay tracked outside the promise `onRetry` returns. */
  retrying?: boolean;
  retryLabel?: string;
  onDismiss?: () => void;
  name?: string;
  /** Inside a Panel, which already draws the frame. */
  bare?: boolean;
}) {
  const t = useTranslations();

  const said = agentText(t, error);

  return (
    <Callout
      action={
        onRetry ? (
          <Button
            icon={RotateCw}
            loading={retrying}
            onClick={onRetry}
            size="sm"
          >
            {retryLabel ?? t("common.retry")}
          </Button>
        ) : null
      }
      bare={bare}
      fix={said.fix}
      name={name ?? error.code}
      onDismiss={onDismiss}
      tone="danger"
    >
      {said.message}
    </Callout>
  );
}
