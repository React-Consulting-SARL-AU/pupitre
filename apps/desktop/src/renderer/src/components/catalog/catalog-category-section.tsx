import type { Manifest, ModuleCategory } from "@pupitre/shared/catalog";
import { Label } from "../ui/label";
import { CatalogModuleCard } from "./catalog-module-card";

/**
 * The seven categories of the contract, in French. A category the agent sends
 * that is not one of them keeps its own name rather than disappearing.
 */
const NAMES: Record<string, string> = {
  core: "Socle",
  runtime: "Runtimes",
  database: "Bases de données",
  ai: "Agents IA",
  editor: "Éditeurs distants",
  exposure: "Exposition",
  tool: "Outils",
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
  return (
    <section className="flex flex-col gap-3" data-category={category}>
      <Label>{NAMES[category] ?? category}</Label>

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
    </section>
  );
}
