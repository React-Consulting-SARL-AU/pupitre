import { useTranslations } from "@renderer/i18n/use-translations";
import type { AgentError } from "@shared/agent";
import { ScrollText } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "./button";
import { ErrorNotice } from "./error-notice";

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

  return (
    <div className="flex flex-col gap-2" data-failure={error.code}>
      <ErrorNotice
        error={error}
        onRetry={onRetry}
        retrying={retrying}
        retryLabel={retryLabel}
      />

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
