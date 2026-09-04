import type { Manifest, ModuleCategory } from "@pupitre/shared/catalog";
import type { DictionaryKey } from "@renderer/i18n/en";
import { translate } from "@renderer/i18n/translate";
import { carriesSecret } from "./catalog-selection";

/**
 * What retiring a module costs, said before it is retired.
 *
 * Nothing here is guessed from a module's name: the category, the dependencies
 * and the secret fields are the manifest's own, so a module the app has never
 * heard of gets a confirmation as precise as the ones it knows. A module the
 * catalogue no longer declares keeps the generic line and loses the rest —
 * still removable, and still with a bill.
 */

export interface Removal {
  allowed: boolean;
  /** Why it cannot be removed at all, when the catalogue forbids it. */
  refusal?: string;
  /** What disappears with it, one line each. */
  losses: string[];
  /** The installed modules that named it in their requirements. */
  dependents: readonly Manifest[];
}

export interface RemovalTarget {
  id: string;
  name: string;
  /** What this server's catalogue declares for it, when it declares it. */
  manifest: Manifest | null;
}

const BY_CATEGORY: Partial<Record<ModuleCategory, DictionaryKey>> = {
  ai: "services.removal.category.ai",
  database: "services.removal.category.database",
  editor: "services.removal.category.editor",
  exposure: "services.removal.category.exposure",
  runtime: "services.removal.category.runtime",
  tool: "services.removal.category.tool",
};

function dependentsOf(id: string, installed: readonly Manifest[]): Manifest[] {
  return installed.filter(
    (candidate) => candidate.id !== id && candidate.requires.includes(id)
  );
}

export function removalOf(
  target: RemovalTarget,
  installed: readonly Manifest[]
): Removal {
  const t = translate();

  const { manifest } = target;
  const dependents = dependentsOf(target.id, installed);
  const losses = [t("services.removal.base", { name: target.name })];

  const ownKey = manifest ? BY_CATEGORY[manifest.category] : undefined;

  if (ownKey) {
    losses.push(t(ownKey));
  }

  if (manifest && carriesSecret(manifest)) {
    losses.push(t("services.removal.secrets"));
  }

  if (dependents.length > 0) {
    losses.push(
      t("services.removal.dependents", {
        names: dependents.map((module) => module.name).join(", "),
      })
    );
  }

  return manifest?.mandatory
    ? {
        allowed: false,
        dependents,
        losses,
        refusal: t("services.removal.mandatory"),
      }
    : { allowed: true, dependents, losses };
}
