import type { JsonObject, StoreMigration } from "./store-migrations";

export const FORWARDS_BASELINE = 1;

export const FORWARDS_MIGRATIONS: readonly StoreMigration[] = [
  {
    apply: keptForwardsDefault,
    id: 2,
    slug: "kept-forwards-default",
  },
];

function keptForwardsDefault(document: JsonObject): JsonObject {
  return Array.isArray(document.kept) ? document : { ...document, kept: [] };
}
