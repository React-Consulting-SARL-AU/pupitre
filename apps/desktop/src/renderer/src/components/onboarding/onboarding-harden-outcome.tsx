import { useTranslations } from "@renderer/i18n/use-translations";
import type { HardenOutcome } from "@shared/harden";
import { ArrowRight, RefreshCw } from "lucide-react";
import { Button } from "../ui/button";
import { Callout } from "../ui/callout";
import { StatusDot } from "../ui/status-dot";

/**
 * What the hardening concluded, in the agent's own words.
 *
 * Root closed, and the app already speaks to the machine as `dev`: there is
 * nothing left to do. Root kept, and the reason is printed exactly as it came —
 * the agent is the one that looked at `authorized_keys`, not us — with the
 * button that tries again once the reason is gone.
 */
export function OnboardingHardenOutcome({
  outcome,
  onRetry,
  onContinue,
}: {
  outcome: HardenOutcome;
  onRetry?: () => void;
  onContinue?: () => void;
}) {
  const t = useTranslations();

  const closed = outcome.harden.root_closed;

  return (
    <section className="flex flex-col gap-gutter">
      {closed ? (
        <div className="elevation-raised flex items-start gap-3 rounded-md border border-line bg-surface px-4 py-4">
          <span className="translate-y-1">
            <StatusDot
              shape={outcome.reconnected ? "filled" : "ringed"}
              size={12}
              tone={outcome.reconnected ? "ok" : "warn"}
            />
          </span>
          <div className="min-w-0">
            <p className="font-medium text-ink">
              {t("onboarding.harden.rootClosedTitle")}
            </p>
            <p className="mt-1 text-ink-3 leading-relaxed">
              {t("onboarding.harden.connectedPrefix")}{" "}
              <code className="font-data text-ink-2">
                {outcome.user ?? outcome.harden.next_user}
              </code>
              {t("onboarding.harden.connectedSuffix")}
            </p>
          </div>
        </div>
      ) : (
        <Callout
          action={
            <Button icon={RefreshCw} onClick={onRetry}>
              {t("common.retry")}
            </Button>
          }
          tone="warn"
        >
          {outcome.harden.reason ?? t("onboarding.harden.noReason")}
        </Callout>
      )}

      {closed ? null : (
        <p className="text-ink-3 leading-relaxed">
          {t("onboarding.harden.rootOpenPrefix")}{" "}
          <code className="font-data text-ink-2">
            {outcome.harden.next_user}
          </code>{" "}
          {t("onboarding.harden.rootOpenSuffix")}
        </p>
      )}

      {outcome.error ? (
        <Callout
          action={
            <Button icon={RefreshCw} onClick={onRetry}>
              {t("common.retry")}
            </Button>
          }
          fix={outcome.error.fix}
          tone="danger"
        >
          {outcome.error.message}
        </Callout>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button icon={ArrowRight} onClick={onContinue} variant="inverse">
          {closed
            ? t("onboarding.finish")
            : t("onboarding.harden.continueOpen")}
        </Button>
      </div>
    </section>
  );
}
