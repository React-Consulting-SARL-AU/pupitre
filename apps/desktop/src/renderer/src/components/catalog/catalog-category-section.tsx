import type { Manifest, ModuleCategory } from "@pupitre/shared/catalog";
import { useTranslations } from "@renderer/i18n/use-translations";
import { CATEGORY_NAMES } from "@renderer/lib/module-category";
import { Section } from "../ui/section";
import { CatalogModuleCard } from "./catalog-module-card";

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

  const name = CATEGORY_NAMES[category];

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
