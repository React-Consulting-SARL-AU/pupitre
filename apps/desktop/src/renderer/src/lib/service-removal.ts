import type { Manifest, ModuleCategory } from "@pupitre/shared/catalog";
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

const BY_CATEGORY: Partial<Record<ModuleCategory, string>> = {
  ai: "L'agent et sa configuration sur cette machine.",
  database:
    "Les bases de données de ce moteur, leurs comptes et leurs mots de passe.",
  editor:
    "Le backend distant préinstallé : la prochaine connexion le retéléchargera.",
  exposure: "Le tunnel et les routes des projets exposés par ce module.",
  runtime:
    "Les versions posées par ce runtime ; les projets qui s'en servent ne démarreront plus.",
  tool: "L'outil et le compte enregistré pour lui.",
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
  const { manifest } = target;
  const dependents = dependentsOf(target.id, installed);
  const losses = [`${target.name} et ce que ce module a posé sur la machine.`];

  const own = manifest ? BY_CATEGORY[manifest.category] : undefined;

  if (own) {
    losses.push(own);
  }

  if (manifest && carriesSecret(manifest)) {
    losses.push(
      "Les secrets envoyés à l'installation : l'app ne les a plus et ne pourra pas les rendre."
    );
  }

  if (dependents.length > 0) {
    losses.push(
      `${dependents.map((module) => module.name).join(", ")} en dépendent et cesseront de fonctionner.`
    );
  }

  return manifest?.mandatory
    ? {
        allowed: false,
        dependents,
        losses,
        refusal: "Le catalogue de ce serveur déclare ce module obligatoire.",
      }
    : { allowed: true, dependents, losses };
}
