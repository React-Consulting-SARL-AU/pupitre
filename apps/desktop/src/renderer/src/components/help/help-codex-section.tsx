import { Panel } from "@renderer/components/ui/panel";
import { FoldingSection } from "@renderer/components/ui/section";
import { useTranslations } from "@renderer/i18n/use-translations";
import { HelpModuleLine } from "./help-module-line";
import type { HelpTarget } from "./help-screen";
import { HelpTerminalSteps } from "./help-terminal-steps";

export function HelpCodexSection({
  target,
  installed,
  onServices,
}: {
  target: HelpTarget;
  installed: boolean;
  onServices: () => void;
}) {
  const t = useTranslations();

  return (
    <FoldingSection name="help-codex" title={t("help.codex.title")}>
      <Panel inset="lg">
        <HelpModuleLine
          installed={installed}
          module="ai.codex"
          onServices={onServices}
          server={target.server.name}
        />
      </Panel>

      <Panel inset="lg">
        <h3 className="font-medium text-ink">{t("help.codex.app")}</h3>
        <p className="mt-1 text-ink-3 text-small leading-relaxed">
          {t("help.codex.app.detail", { ssh: target.server.ssh })}
        </p>
      </Panel>

      <Panel inset="lg">
        <HelpTerminalSteps
          label={t("help.codex.terminal")}
          target={target}
          tool="codex"
        />
      </Panel>
    </FoldingSection>
  );
}
