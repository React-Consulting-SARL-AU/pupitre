import { useTranslations } from "@renderer/i18n/use-translations";
import type { AgentError } from "@shared/agent";
import { ScrollText } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "./button";
import { ErrorNotice } from "./error-notice";

export function StepFailure({
  error,
  onRetry,
  retrying = false,
  retryLabel,
  journal,
}: {
  error: AgentError;
  onRetry?: () => void;
  retrying?: boolean;
  retryLabel?: string;
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
