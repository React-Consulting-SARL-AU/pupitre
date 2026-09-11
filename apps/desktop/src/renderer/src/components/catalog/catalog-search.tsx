import { useTranslations } from "@renderer/i18n/use-translations";
import { Search, X } from "lucide-react";
import { proseControlClass } from "../ui/field";
import { IconButton } from "../ui/icon-button";

/**
 * Finding one service among the twenty-odd the agent declares.
 *
 * The phrase narrows the catalogue in place — categories keep their order and
 * their names — so the reader never loses where a card sits. What it found is
 * counted beside the field, because a filter that silently hides half the
 * catalogue is how a reader concludes a service does not exist.
 */
export function CatalogSearch({
  query,
  found,
  onQuery,
}: {
  query: string;
  /** How many modules the phrase leaves, said only while one is typed. */
  found: number;
  onQuery?: (query: string) => void;
}) {
  const t = useTranslations();

  const searching = query.trim().length > 0;

  return (
    <div className="flex items-center gap-2" data-catalog-search="true">
      <div className="relative min-w-0 flex-1">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-4"
          size={13}
          strokeWidth={1.5}
        />

        <input
          aria-label={t("catalog.search.label")}
          className={`${proseControlClass} pl-8 [&::-webkit-search-cancel-button]:appearance-none`}
          onChange={(event) => onQuery?.(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && searching) {
              event.preventDefault();
              onQuery?.("");
            }
          }}
          placeholder={t("catalog.search.placeholder")}
          type="search"
          value={query}
        />
      </div>

      {searching ? (
        <>
          <span
            aria-live="polite"
            className="whitespace-nowrap text-[12px] text-ink-3"
            data-search-found={found}
          >
            {t.plural("catalog.search.found", found)}
          </span>

          <IconButton
            icon={X}
            label={t("catalog.search.clear")}
            onClick={() => onQuery?.("")}
            variant="discreet"
          />
        </>
      ) : null}
    </div>
  );
}
