import { useTranslations } from "@renderer/i18n/use-translations";
import { Check } from "lucide-react";
import { Button } from "../ui/button";
import { PageHeader } from "../ui/page-header";
import { StatusDot } from "../ui/status-dot";

/**
 * The end of the onboarding: a machine that runs the agent, reached by the
 * account it opened. What comes next — the first project — is its own screen.
 */
export function OnboardingDoneScreen({
  serverName,
  user,
  rootClosed,
  onClose,
}: {
  serverName?: string;
  user: string;
  rootClosed: boolean;
  onClose?: () => void;
}) {
  const t = useTranslations();

  return (
    <section className="flex flex-col gap-section">
      <PageHeader
        actions={
          <Button icon={Check} onClick={onClose} variant="inverse">
            {t("onboarding.finish")}
          </Button>
        }
        description={t("onboarding.done.description")}
        eyebrow={t("onboarding.done.eyebrow")}
        title={serverName ?? t("onboarding.thisServer")}
      />

      <div className="elevation-raised flex items-start gap-3 rounded-md border border-line bg-surface px-4 py-4">
        <span className="translate-y-1">
          <StatusDot
            shape={rootClosed ? "filled" : "ringed"}
            size={12}
            tone={rootClosed ? "ok" : "warn"}
          />
        </span>
        <div className="min-w-0">
          <p className="font-medium text-ink">
            {t("onboarding.done.connectedAs")}{" "}
            <code className="font-data">{user}</code>
          </p>
          <p className="mt-1 text-ink-3 leading-relaxed">
            {rootClosed
              ? t("onboarding.done.rootClosed")
              : t("onboarding.done.rootOpen")}
          </p>
        </div>
      </div>
    </section>
  );
}
