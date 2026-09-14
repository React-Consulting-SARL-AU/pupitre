import type { Manifest, ModuleCategory } from "@pupitre/shared/catalog";
import type { DictionaryKey } from "@renderer/i18n/en";
import { useTranslations } from "@renderer/i18n/use-translations";
import { Section } from "../ui/section";
import { CatalogModuleCard } from "./catalog-module-card";

/**
 * The seven categories of the contract. A category the agent sends that is not
 * one of them keeps its own name rather than disappearing.
 */
const NAMES: Record<string, DictionaryKey> = {
  core: "catalog.category.core",
  runtime: "catalog.category.runtime",
  database: "catalog.category.database",
  ai: "catalog.category.ai",
  editor: "catalog.category.editor",
  exposure: "catalog.category.exposure",
  tool: "catalog.category.tool",
};

export function CatalogCategorySection({
  category,
  modules,
  selected,
  blocked,
  onToggle,
}: {
  category: ModuleCategory;
  modules: readonly Manifest[];
  selected: readonly string[];
  blocked: Map<string, string>;
  onToggle?: (moduleId: string) => void;
}) {
  const t = useTranslations();

  const name = NAMES[category];

  return (
    <Section
      data-category={category}
      name={category}
      title={name ? t(name) : category}
    >
      <ul className="grid gap-gutter lg:grid-cols-2">
        {modules.map((module) => (
          <CatalogModuleCard
            key={module.id}
            module={module}
            onToggle={onToggle}
            reason={blocked.get(module.id)}
            selected={selected.includes(module.id)}
          />
        ))}
      </ul>
    </Section>
  );
}
