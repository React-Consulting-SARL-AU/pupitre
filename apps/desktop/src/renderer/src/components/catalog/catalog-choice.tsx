import type {
  CatalogResult,
  ProbeResult,
} from "@pupitre/shared/agent-protocol/install";
import { riseAt } from "@renderer/lib/motion";
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
 * Categories, modules, summaries and presets all come from the answer to
 * `catalog`: a module that appears on the server appears here, in its
 * category, with its fields, without a line of this file changing. What the
 * choice weighs is said last, once, against the machine.
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
  onPreset?: (presetId: string, chosen?: string) => void;
}) {
  const groups = byCategory(catalog.modules);

  return (
    <div className="flex flex-col gap-section">
      <div className="rise" style={riseAt(0)}>
        <CatalogPresets
          modules={catalog.modules}
          onPick={onPreset}
          presets={catalog.presets}
        />
      </div>

      {groups.map((group, index) => (
        <div className="rise" key={group.category} style={riseAt(1 + index)}>
          <CatalogCategorySection
            blocked={blocked}
            category={group.category}
            modules={group.modules}
            onToggle={onToggle}
            selected={selected}
          />
        </div>
      ))}

      <div className="rise" style={riseAt(1 + groups.length)}>
        <CatalogResources
          needs={totals(catalog.modules, selected)}
          probe={probe}
          warnings={warnings}
        />
      </div>
    </div>
  );
}
