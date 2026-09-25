import { useTranslations } from "@renderer/i18n/use-translations";
import { Panel } from "../ui/panel";

/**
 * The project's own output, as the agent sends it.
 *
 * It stays open once there is something to read, and it stays on screen when
 * the project fails to start: the reason a process died is in its last lines,
 * not in the command that started it.
 */
export function ProjectAddJournal({ lines }: { lines: readonly string[] }) {
  const t = useTranslations();

  if (lines.length === 0) {
    return null;
  }

  return (
    <Panel as="section" className="overflow-hidden" inset="none">
      <header className="flex items-center justify-between px-4 py-2.5">
        <span className="label text-ink-3">
          {t("projectAdd.journal.title")}
        </span>
        <span className="font-data text-ink-3 text-small">
          {t("projectAdd.journal.lines", { count: lines.length })}
        </span>
      </header>

      <pre className="max-h-72 overflow-auto border-line border-t bg-sunken px-4 py-3 font-data text-ink-2 text-small leading-relaxed">
        {lines.join("\n")}
      </pre>
    </Panel>
  );
}
