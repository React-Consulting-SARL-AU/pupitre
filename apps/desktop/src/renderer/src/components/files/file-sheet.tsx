import type { FsStatResult } from "@pupitre/shared/agent-protocol/files";
import { useTranslations } from "@renderer/i18n/use-translations";
import { since, weight } from "@renderer/lib/format";

/**
 * What the agent says of a file without reading it: its weight, its type
 * when it recognises one, when it last changed, and its mode. It is all the
 * pane has for a file the channel does not carry, and it is shown for every
 * file, under the image or beside the editor's name.
 */
export function FileSheet({ stat }: { stat: FsStatResult }) {
  const t = useTranslations();

  const modified = Date.parse(stat.modified_at);

  const rows: [string, string][] = [
    [t("files.sheet.size"), weight(stat.size_bytes)],
    [t("files.sheet.type"), stat.media_type ?? t("files.sheet.typeUnknown")],
    [
      t("files.sheet.modified"),
      Number.isNaN(modified) ? stat.modified_at : since(modified),
    ],
    [t("files.sheet.mode"), stat.mode],
  ];

  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-small">
      {rows.map(([label, value]) => (
        <div className="contents" key={label}>
          <dt className="text-ink-3">{label}</dt>
          <dd className="font-data text-ink tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
