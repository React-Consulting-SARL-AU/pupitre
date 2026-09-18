import { describe, expect, it } from "bun:test";
import { MODULE_CATEGORIES } from "@pupitre/shared/catalog";
import { CATEGORY_NAMES, groupByCategory } from "../module-category";

describe("les modules par catégorie", () => {
  it("suivent l'ordre du catalogue, quel que soit l'ordre reçu", () => {
    const groups = groupByCategory(
      ["tool.github", "db.mysql", "runtime.node", "core.system", "db.redis"],
      (id) => id
    );

    expect(groups.map((group) => group.category)).toEqual([
      "core",
      "runtime",
      "database",
      "tool",
    ]);
    expect(groups[2]?.items).toEqual(["db.mysql", "db.redis"]);
  });

  it("gardent après les sept une catégorie que le contrat ne nomme pas, sous son propre nom", () => {
    const groups = groupByCategory(["x.thing", "ai.claude"], (id) => id);

    expect(groups.map((group) => group.category)).toEqual(["ai", "x"]);
  });

  it("taisent une catégorie sans module", () => {
    expect(groupByCategory([], (id) => id)).toEqual([]);
  });

  it("nomment chacune des sept catégories", () => {
    for (const category of MODULE_CATEGORIES) {
      expect(CATEGORY_NAMES[category]).toBeDefined();
    }
  });
});
