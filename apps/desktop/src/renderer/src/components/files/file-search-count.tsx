import type { SearchQuery } from "@codemirror/search";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { Matches } from "@renderer/lib/editor-search";

export function FileSearchCount({
  matches,
  query,
}: {
  matches: Matches;
  query: SearchQuery;
}) {
  const t = useTranslations();

  if (query.search === "") {
    return null;
  }

  let text: string;
  let tone = "text-ink-3";

  if (!query.valid) {
    text = t("files.search.invalid");
    tone = "text-danger";
  } else if (matches.total === 0) {
    text = t("files.search.none");
  } else if (matches.capped) {
    text = t("files.search.capped", { count: matches.total });
  } else if (matches.current === null) {
    text = t.plural("files.search.count", matches.total);
  } else {
    text = t("files.search.position", {
      current: matches.current,
      total: matches.total,
    });
  }

  return (
    <span
      className={`shrink-0 whitespace-nowrap font-data text-caption ${tone}`}
      data-search-count={matches.total}
      role="status"
    >
      {text}
    </span>
  );
}
