import { useTranslations } from "@renderer/i18n/use-translations";
import { Details } from "../ui/details";
/**
 * Everything that was said, folded away.
 *
 * The module list above already tells the story; this is for the line someone
 * will want to paste into a ticket, so it keeps the order and nothing else.
 */
export function InstallLog({ lines }: { lines: readonly string[] }) {
  const t = useTranslations();

  if (lines.length === 0) {
    return null;
  }

  return (
    <Details
      className="elevation-raised rounded-md border border-line bg-surface px-4 py-2"
      label={t.plural("install.journal.lines", lines.length)}
      name="journal"
    >
      <pre className="-mx-4 mt-1 max-h-72 overflow-auto border-line border-t bg-sunken px-4 py-3 font-data text-ink-3 text-small leading-relaxed">
        {lines.join("\n")}
      </pre>
    </Details>
  );
}
