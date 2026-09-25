import { Button } from "@renderer/components/ui/button";
import { Callout } from "@renderer/components/ui/callout";
import { Fact, FactList } from "@renderer/components/ui/fact";
import { Panel } from "@renderer/components/ui/panel";
import { FoldingSection } from "@renderer/components/ui/section";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { SshShareState } from "@shared/ssh-names";
import { Settings } from "lucide-react";

export function HelpReachSection({
  state,
  onSettings,
}: {
  state: SshShareState;
  onSettings: () => void;
}) {
  const t = useTranslations();

  return (
    <FoldingSection name="help-reach" open title={t("help.reach.title")}>
      {state.shared ? (
        <Callout name="help-shared" tone="ok">
          {t("help.reach.shared")}
        </Callout>
      ) : (
        <Callout
          action={
            <Button icon={Settings} onClick={onSettings} size="sm">
              {t("help.reach.enable")}
            </Button>
          }
          fix={t("help.reach.unshared.fix")}
          name="help-unshared"
          tone="warn"
        >
          {t("help.reach.unshared")}
        </Callout>
      )}

      {state.servers.length === 0 ? (
        <p className="text-ink-2">{t("help.noServer")}</p>
      ) : (
        state.servers.map((server) => (
          <Panel data-help-server={server.id} inset="lg" key={server.id}>
            <h3 className="font-medium text-ink">{server.name}</h3>

            <FactList className="mt-4" columns={3}>
              <Fact
                detail={t("help.reach.command.detail")}
                label={t("help.reach.command")}
              >
                ssh {server.ssh}
              </Fact>
              <Fact label={t("help.reach.account")}>
                {server.user}@{server.host}:{server.port}
              </Fact>
              {server.identityFile ? (
                <Fact
                  detail={t("help.reach.key.detail")}
                  label={t("help.reach.key")}
                >
                  {server.identityFile}
                </Fact>
              ) : null}
            </FactList>
          </Panel>
        ))
      )}
    </FoldingSection>
  );
}
