import { describe, expect, it } from "bun:test";
import { MODULE_CATEGORIES } from "@pupitre/shared/catalog";
import { CATEGORY_NAMES, groupByCategory } from "../module-category";

describe("modules by category", () => {
  it("follow the catalogue order, whatever order they arrive in", () => {
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

  it("keep after the seven a category the contract does not name, under its own name", () => {
    const groups = groupByCategory(["x.thing", "ai.claude"], (id) => id);

    expect(groups.map((group) => group.category)).toEqual(["ai", "x"]);
  });

  it("omit a category with no module", () => {
    expect(groupByCategory([], (id) => id)).toEqual([]);
  });

  it("name each of the seven categories", () => {
    for (const category of MODULE_CATEGORIES) {
      expect(CATEGORY_NAMES[category]).toBeDefined();
    }
  });
});
