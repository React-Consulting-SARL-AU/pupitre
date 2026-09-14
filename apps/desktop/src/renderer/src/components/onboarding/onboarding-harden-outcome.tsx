import { agentText } from "@renderer/i18n/agent-error";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { HardenOutcome } from "@shared/harden";
import { RefreshCw } from "lucide-react";
import { Button } from "../ui/button";
import { Callout } from "../ui/callout";
import { Panel } from "../ui/panel";
import { StatusDot } from "../ui/status-dot";

/**
 * What the hardening concluded, in the agent's own words.
 *
 * Root closed, and the app already speaks to the machine as `dev`: there is
 * nothing left to do. Root kept because the configuration asked for it is the
 * same ending, said otherwise: the machine is hardened, root simply keeps a key
 * of its own. A refusal prints the reason exactly as it came — the agent is the
 * one that looked at `authorized_keys`, not us — with the button that tries
 * again once the reason is gone. The way on is the screen's bar, not this.
 */
export function OnboardingHardenOutcome({
  outcome,
  onRetry,
}: {
  outcome: HardenOutcome;
  onRetry?: () => void;
}) {
  const t = useTranslations();

  const closed = outcome.harden.root_closed;
  const hardened = closed || outcome.harden.root_kept;

  return (
    <section className="flex flex-col gap-gutter">
      {hardened ? (
        <Panel className="flex items-start gap-3">
          <span className="translate-y-1">
            <StatusDot
              shape={outcome.reconnected ? "filled" : "ringed"}
              size={12}
              tone={outcome.reconnected ? "ok" : "warn"}
            />
          </span>
          <div className="min-w-0">
            <p className="font-medium text-ink">
              {closed
                ? t("onboarding.harden.rootClosedTitle")
                : t("onboarding.harden.rootKeptTitle")}
            </p>
            <p className="mt-1 text-ink-3 leading-relaxed">
              {t("onboarding.harden.connectedPrefix")}{" "}
              <code className="font-data text-ink-2">
                {outcome.user ?? outcome.harden.next_user}
              </code>
              {t("onboarding.harden.connectedSuffix")}
            </p>
            {closed ? null : (
              <p className="mt-1 text-ink-3 leading-relaxed">
                {t("onboarding.harden.rootKeptDetail")}
              </p>
            )}
          </div>
        </Panel>
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

      {hardened ? null : (
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
          fix={agentText(t, outcome.error).fix}
          tone="danger"
        >
          {agentText(t, outcome.error).message}
        </Callout>
      ) : null}
    </section>
  );
}
