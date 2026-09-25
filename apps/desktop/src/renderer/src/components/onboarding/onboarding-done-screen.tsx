import { useTranslations } from "@renderer/i18n/use-translations";
import { Check, ShieldCheck } from "lucide-react";
import { ActionBar } from "../ui/action-bar";
import { Button } from "../ui/button";
import { Panel } from "../ui/panel";
import { Screen } from "../ui/screen";
import { StatusDot } from "../ui/status-dot";

const ROOT_LINE = {
  closed: "onboarding.done.rootClosed",
  kept: "onboarding.done.rootKept",
  open: "onboarding.done.rootOpen",
} as const;

export function OnboardingDoneScreen({
  serverName,
  user,
  root,
  onClose,
  onSecure,
}: {
  serverName?: string;
  user: string;
  /** "kept" is asked for by the configuration; "open" means the hardening stopped. */
  root: "closed" | "kept" | "open";
  onClose?: () => void;
  onSecure?: () => void;
}) {
  const t = useTranslations();

  const hardened = root !== "open";

  return (
    <Screen
      column
      eyebrow={serverName ?? t("onboarding.thisServer")}
      footer={
        <ActionBar name="done">
          <Button icon={Check} onClick={onClose} variant="inverse">
            {t("onboarding.finish")}
          </Button>
        </ActionBar>
      }
      plain
      step="done"
      title={t("onboarding.done.title")}
    >
      <Panel className="flex items-start gap-3">
        <span className="translate-y-1">
          <StatusDot
            shape={hardened ? "filled" : "ringed"}
            size={12}
            tone={hardened ? "ok" : "warn"}
          />
        </span>
        <div className="min-w-0">
          <p className="font-medium text-ink">
            {t("onboarding.done.connectedAs")}{" "}
            <code className="font-data">{user}</code>
          </p>
          <p className="mt-1 text-ink-3 leading-relaxed">
            {t(ROOT_LINE[root])}
          </p>
          {hardened || !onSecure ? null : (
            <Button
              className="mt-3"
              icon={ShieldCheck}
              onClick={onSecure}
              size="sm"
            >
              {t("onboarding.secureAgain")}
            </Button>
          )}
        </div>
      </Panel>
    </Screen>
  );
}
