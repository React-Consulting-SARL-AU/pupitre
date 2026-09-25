import type { Manifest, ModuleCategory } from "@pupitre/shared/catalog";
import type { DictionaryKey } from "@renderer/i18n/en";
import { translate } from "@renderer/i18n/translate";
import { carriesSecret } from "./catalog-selection";

export interface Removal {
  allowed: boolean;
  refusal?: string;
  losses: string[];
  dependents: readonly Manifest[];
}

export interface RemovalTarget {
  id: string;
  name: string;
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

/** Read off the manifest alone, so a module the app never heard of gets as precise a confirmation. */
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
