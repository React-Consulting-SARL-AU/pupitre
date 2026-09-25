import type {
  CatalogResult,
  ProbeResult,
} from "@pupitre/shared/agent-protocol/install";
import { useTranslations } from "@renderer/i18n/use-translations";
import { riseAt } from "@renderer/lib/motion";
import { SearchX } from "lucide-react";
import {
  byCategory,
  type Installed,
  matching,
  type ResourceWarning,
  totals,
} from "../../lib/catalog-selection";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { CatalogCategorySection } from "./catalog-category-section";
import { CatalogPresets } from "./catalog-presets";
import { CatalogResources } from "./catalog-resources";
import { CatalogSearch } from "./catalog-search";

export function CatalogChoice({
  catalog,
  selected,
  blocked,
  warnings,
  probe = null,
  installed = [],
  query = "",
  onQuery,
  onToggle,
  onPreset,
}: {
  catalog: CatalogResult;
  selected: readonly string[];
  blocked: Map<string, string>;
  warnings: readonly ResourceWarning[];
  probe?: ProbeResult | null;
  installed?: Installed;
  query?: string;
  onQuery?: (query: string) => void;
  onToggle?: (moduleId: string) => void;
  onPreset?: (presetId: string, chosen?: string) => void;
}) {
  const t = useTranslations();

  const searching = query.trim().length > 0;
  const found = matching(catalog.modules, query);
  const groups = byCategory(found);

  return (
    <div className="flex flex-col gap-section">
      {searching ? null : (
        <div className="rise" style={riseAt(0)}>
          <CatalogPresets
            installed={installed}
            modules={catalog.modules}
            onPick={onPreset}
            presets={catalog.presets}
            probe={probe}
            selected={selected}
          />
        </div>
      )}

      <div className="rise" style={riseAt(1)}>
        <CatalogSearch found={found.length} onQuery={onQuery} query={query} />
      </div>

      {groups.length === 0 ? (
        <EmptyState
          action={
            <Button onClick={() => onQuery?.("")}>
              {t("catalog.search.clear")}
            </Button>
          }
          detail={t("catalog.search.emptyDetail")}
          icon={SearchX}
          title={t("catalog.search.emptyTitle", { query: query.trim() })}
        />
      ) : null}

      {groups.map((group, index) => (
        <div className="rise" key={group.category} style={riseAt(2 + index)}>
          <CatalogCategorySection
            blocked={blocked}
            category={group.category}
            modules={group.modules}
            onToggle={onToggle}
            selected={selected}
          />
        </div>
      ))}

      <div className="rise" style={riseAt(2 + groups.length)}>
        <CatalogResources
          needs={totals(catalog.modules, selected)}
          probe={probe}
          warnings={warnings}
        />
      </div>
    </div>
  );
}
