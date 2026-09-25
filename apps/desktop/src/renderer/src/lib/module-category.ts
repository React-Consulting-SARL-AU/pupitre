import { categoryOfModule, MODULE_CATEGORIES } from "@pupitre/shared/catalog";
import type { DictionaryKey } from "@renderer/i18n/en";

export const CATEGORY_NAMES: Record<string, DictionaryKey> = {
  core: "catalog.category.core",
  runtime: "catalog.category.runtime",
  database: "catalog.category.database",
  ai: "catalog.category.ai",
  editor: "catalog.category.editor",
  exposure: "catalog.category.exposure",
  tool: "catalog.category.tool",
};

export interface ModuleGroup<T> {
  category: string;
  items: T[];
}

export function groupByCategory<T>(
  items: readonly T[],
  idOf: (item: T) => string
): ModuleGroup<T>[] {
  const groups = new Map<string, T[]>(
    MODULE_CATEGORIES.map((category) => [category, []])
  );

  for (const item of items) {
    const category = categoryOfModule(idOf(item));
    const group = groups.get(category);

    if (group) {
      group.push(item);
    } else {
      groups.set(category, [item]);
    }
  }

  return [...groups]
    .filter(([, grouped]) => grouped.length > 0)
    .map(([category, grouped]) => ({ category, items: grouped }));
}
