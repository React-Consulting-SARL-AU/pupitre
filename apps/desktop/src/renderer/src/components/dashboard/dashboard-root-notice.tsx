import { Button } from "@renderer/components/ui/button";
import { Callout } from "@renderer/components/ui/callout";
import type { DictionaryKey } from "@renderer/i18n/en";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { SecuringNeed } from "@renderer/lib/server-security";
import { ShieldCheck } from "lucide-react";

const WORDS: Record<
  SecuringNeed,
  { message: DictionaryKey; fix: DictionaryKey }
> = {
  root: {
    fix: "dashboard.rootOpen.fix",
    message: "dashboard.rootOpen.message",
  },
  sudo: { fix: "sudo.notice.fix", message: "sudo.notice.message" },
};

export function DashboardRootNotice({
  need,
  onSecure,
}: {
  need: SecuringNeed;
  onSecure: () => void;
}) {
  const t = useTranslations();

  return (
    <Callout
      action={
        <Button icon={ShieldCheck} onClick={onSecure} size="sm">
          {t("onboarding.secureAgain")}
        </Button>
      }
      fix={t(WORDS[need].fix)}
      name={need === "root" ? "root-open" : "sudo-open"}
      tone="warn"
    >
      {t(WORDS[need].message)}
    </Callout>
  );
}
