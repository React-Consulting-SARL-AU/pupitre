import { CopyField } from "@renderer/components/ui/copy-field";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { HelpTarget } from "./help-screen";

export function HelpTerminalSteps({
  target,
  tool,
  label,
}: {
  target: HelpTarget;
  tool: string;
  label: string;
}) {
  const t = useTranslations();

  const lines = [
    `ssh ${target.host}`,
    `tmux new -A -s ${tool}`,
    `cd ${target.projectPath} && ${tool}`,
  ];

  return (
    <CopyField
      help={t("help.terminal.detail")}
      label={label}
      lines
      value={lines.join("\n")}
    />
  );
}
