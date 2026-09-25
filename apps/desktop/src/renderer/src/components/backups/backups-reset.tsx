import { CheckLine } from "@renderer/components/ui/check-line";
import { ConfirmButton } from "@renderer/components/ui/confirm-button";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { Panel } from "@renderer/components/ui/panel";
import { Section } from "@renderer/components/ui/section";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { AgentError } from "@shared/agent";
import { RotateCcw } from "lucide-react";
import { useState } from "react";

export function BackupsReset({
  onReset,
}: {
  onReset: (forgetConnection: boolean) => Promise<AgentError | null>;
}) {
  const t = useTranslations();

  const [forget, setForget] = useState(true);
  const [refusal, setRefusal] = useState<AgentError | null>(null);

  async function reset(): Promise<void> {
    setRefusal(await onReset(forget));
  }

  return (
    <Section name="backup-reset" title={t("backups.reset.title")}>
      <Panel className="flex flex-col gap-5" inset="lg">
        <p className="text-control text-ink-2 leading-relaxed">
          {t("backups.reset.consequence")}
        </p>

        <CheckLine
          checked={forget}
          detail={t("backups.reset.forgetDetail")}
          label={t("backups.reset.forget")}
          name="backup-reset-forget"
          onChange={setForget}
        />

        <div>
          <ConfirmButton
            confirmLabel={t("backups.reset.confirm")}
            icon={RotateCcw}
            onConfirm={reset}
            question={t("backups.reset.question")}
            size="sm"
          >
            {t("backups.reset.open")}
          </ConfirmButton>
        </div>

        {refusal ? <ErrorNotice bare error={refusal} /> : null}
      </Panel>
    </Section>
  );
}
