import { Callout } from "@renderer/components/ui/callout";
import { Fact, FactList } from "@renderer/components/ui/fact";
import { Panel } from "@renderer/components/ui/panel";
import { FoldingSection } from "@renderer/components/ui/section";
import { useTranslations } from "@renderer/i18n/use-translations";
import { HelpModuleLine } from "./help-module-line";
import type { HelpTarget } from "./help-screen";
import { HelpTerminalSteps } from "./help-terminal-steps";

/**
 * Claude Code on the server, from the Claude app or from a terminal. The
 * app's form asks four things; each is answered with the driven server's own
 * value, so the reader copies rather than works it out.
 */
export function HelpClaudeSection({
  target,
  installed,
  onServices,
}: {
  target: HelpTarget;
  installed: boolean;
  onServices: () => void;
}) {
  const t = useTranslations();

  const { server } = target;

  return (
    <FoldingSection name="help-claude" title={t("help.claude.title")}>
      <Panel inset="lg">
        <HelpModuleLine
          installed={installed}
          module="ai.claude"
          onServices={onServices}
          server={server.name}
        />
      </Panel>

      <Panel inset="lg">
        <h3 className="font-medium text-ink">{t("help.claude.app")}</h3>
        <p className="mt-1 text-ink-3 text-small">
          {t("help.claude.app.detail")}
        </p>

        <FactList className="mt-4">
          <Fact label={t("help.claude.field.name")} prose>
            {server.name}
          </Fact>
          <Fact label={t("help.claude.field.host")}>{target.host}</Fact>
          <Fact label={t("help.claude.field.port")}>{server.port}</Fact>
          {server.identityFile ? (
            <Fact
              detail={t("help.claude.field.identity.detail")}
              label={t("help.claude.field.identity")}
            >
              {server.identityFile}
            </Fact>
          ) : null}
        </FactList>
      </Panel>

      <Panel inset="lg">
        <HelpTerminalSteps
          label={t("help.claude.terminal")}
          target={target}
          tool="claude"
        />

        <div className="mt-4">
          <Callout bare name="help-claude-login">
            {t("help.claude.login")}
          </Callout>
        </div>
      </Panel>
    </FoldingSection>
  );
}
