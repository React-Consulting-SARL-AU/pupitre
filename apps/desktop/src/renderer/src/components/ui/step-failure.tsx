import { agentText } from "@renderer/i18n/agent-error";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { AgentError } from "@shared/agent";
import { RefreshCw, ScrollText } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "./button";
import { Callout } from "./callout";

/**
 * A step that stopped, said the same way everywhere.
 *
 * Eight screens each wrote their own pair of a danger notice and a retry
 * button, in eight sets of words, and one of them offered three retries at
 * once. What a reader owes is always the same three things: what failed, the
 * remedy the server itself gave, and the one gesture that tries again.
 */
export function StepFailure({
  error,
  onRetry,
  retrying = false,
  retryLabel,
  journal,
}: {
  error: AgentError;
  onRetry?: () => void;
  /** The retry is under way: the button spins rather than waiting silently. */
  retrying?: boolean;
  retryLabel?: string;
  /** What was said before it stopped, folded away until it is asked for. */
  journal?: ReactNode;
}) {
  const t = useTranslations();

  const [open, setOpen] = useState(false);
  const said = agentText(t, error);

  return (
    <div className="flex flex-col gap-2" data-failure={error.code}>
      <Callout
        action={
          onRetry ? (
            <Button icon={RefreshCw} loading={retrying} onClick={onRetry}>
              {retryLabel ?? t("common.retry")}
            </Button>
          ) : null
        }
        fix={said.fix}
        tone="danger"
      >
        {said.message}
      </Callout>

      {journal ? (
        <div>
          <Button
            icon={ScrollText}
            onClick={() => setOpen(!open)}
            size="sm"
            variant="discreet"
          >
            {open ? t("common.hide") : t("onboarding.failure.journal")}
          </Button>

          {open ? <div className="mt-2">{journal}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
