import { useTranslations } from "@renderer/i18n/use-translations";

/**
 * The project's own output, as the agent sends it.
 *
 * It stays open once there is something to read, and it stays on screen when
 * the project fails to start: the reason a process died is in its last lines,
 * not in the command that started it.
 */
export function FirstProjectJournal({ lines }: { lines: readonly string[] }) {
  const t = useTranslations();

  if (lines.length === 0) {
    return null;
  }

  return (
    <section className="elevation-raised overflow-hidden rounded-md border border-line bg-surface">
      <header className="flex items-center justify-between px-4 py-2.5">
        <span className="label text-ink-3">
          {t("firstProject.journal.title")}
        </span>
        <span className="font-data text-[11px] text-ink-4">
          {t("firstProject.journal.lines", { count: lines.length })}
        </span>
      </header>

      <pre className="max-h-72 overflow-auto border-line border-t bg-sunken px-4 py-3 font-data text-[11px] text-ink-2 leading-relaxed">
        {lines.join("\n")}
      </pre>
    </section>
  );
}
