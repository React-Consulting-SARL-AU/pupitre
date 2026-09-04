import type {
  CatalogResult,
  ProbeResult,
} from "@pupitre/shared/agent-protocol/install";
import {
  byCategory,
  type ResourceWarning,
  totals,
} from "../../lib/catalog-selection";
import { CatalogCategorySection } from "./catalog-category-section";
import { CatalogPresets } from "./catalog-presets";
import { CatalogResources } from "./catalog-resources";

/**
 * The catalogue as the agent declared it, and nothing else.
 *
 * Categories, modules, summaries, figures and presets all come from the answer
 * to `catalog`: a module that appears on the server appears here, in its
 * category, with its fields, without a line of this file changing.
 */
export function CatalogChoice({
  catalog,
  selected,
  blocked,
  warnings,
  probe = null,
  onToggle,
  onPreset,
}: {
  catalog: CatalogResult;
  selected: readonly string[];
  blocked: Map<string, string>;
  warnings: readonly ResourceWarning[];
  probe?: ProbeResult | null;
  onToggle?: (moduleId: string) => void;
  onPreset?: (presetId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-section">
      <CatalogPresets onPick={onPreset} presets={catalog.presets} />

      <CatalogResources
        needs={totals(catalog.modules, selected)}
        probe={probe}
        warnings={warnings}
      />

      {byCategory(catalog.modules).map((group) => (
        <CatalogCategorySection
          blocked={blocked}
          category={group.category}
          key={group.category}
          modules={group.modules}
          onToggle={onToggle}
          selected={selected}
        />
      ))}
    </div>
  );
}
