import { CopyField } from "@renderer/components/ui/copy-field";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { HelpTarget } from "./help-screen";

/**
 * The three lines a session takes from a terminal: reach the server, hold the
 * session in tmux, start the tool where the project is. One field, one copy:
 * the lines are pasted together, and read together before they are.
 */
export function HelpTerminalSteps({
  target,
  tool,
  label,
}: {
  target: HelpTarget;
  /** The command the session ends on: `claude`, `codex`. */
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
