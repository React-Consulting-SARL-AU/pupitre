# Documentation

Tout ce qu'un agent doit lire avant de toucher au code, et tout ce que le propriétaire du projet doit tenir à jour. Les documents sont la spécification ; le code les suit.

## Carte

| Document | Ce qu'il contient | Qui le lit |
| --- | --- | --- |
| [`product/PRODUCT.md`](./product/PRODUCT.md) | Le produit, les cibles, l'offre, les prix, la voix | tout le monde |
| [`product/DESIGN.md`](./product/DESIGN.md) | Le système de design monochrome : tokens, règles, mise en œuvre | site, web, desktop |
| [`architecture.md`](./architecture.md) | Les composants, les runtimes, les frontières, les règles qui ne bougent pas | tout le monde |
| [`monorepo.md`](./monorepo.md) | Outillage : Bun, Turbo, Biome, hooks, CI, Cloudflare Builds, secrets | tout le monde |
| [`deploy.md`](./deploy.md) | La mise en ligne, étape par étape : Cloudflare, Neon, R2, Stripe, Pages, GitHub Actions | le propriétaire |
| [`security.md`](./security.md) | Modèle de menace, protection du code, droit d'usage, jetons | web, desktop, agent |
| [`legal.md`](./legal.md) | L'éditeur, les pages légales en brouillon, ce qui reste à remplir à l'immatriculation | tout le monde |
| [`incorporation.pdf`](./incorporation.pdf) | Constitution de Pupitre Inc. au Delaware, comptes à ouvrir, échéances de conformité annuelles | le propriétaire |
| [`contracts/agent-protocol.md`](./contracts/agent-protocol.md) | Le protocole JSON entre l'app et l'agent, sur SSH | desktop, agent |
| [`contracts/platform-api.md`](./contracts/platform-api.md) | L'API `/api/v1` consommée par la console, l'app et l'agent | web, desktop, agent |
| [`contracts/service-catalog.md`](./contracts/service-catalog.md) | Les modules du catalogue, leurs manifestes, leurs champs | desktop, agent |
| [`contracts/config-migrations.md`](./contracts/config-migrations.md) | Comment une configuration passe d'une version à la suivante, sur le VPS et sur le laptop | desktop, agent |
| [`decisions/`](./decisions/) | Une décision par fichier. Un agent qui veut « améliorer » une décision la lit d'abord | tout le monde |
| [`SETUP.md`](./SETUP.md) | LEGACY : l'installation manuelle de la stack bash. Source de vérité des étapes que les modules Go reproduisent | agent |
| [`plans/`](./plans/) | Les décisions encore ouvertes d'un chantier livré. Un plan disparaît quand ses questions sont tranchées | tout le monde |
| [`tasks/`](./tasks/) | Ce qui est décidé mais attend un compte, une validation ou une échéance extérieure. Un fichier par tâche, supprimé le jour où elle est faite | tout le monde |

## Conventions d'écriture

- Français, présent, phrases courtes. Un document dit ce qui est vrai, pas ce qui a été envisagé.
- Un document qui contredit un autre est un bug : corriger les deux dans la même passe.
- Les décisions vont dans `decisions/`, jamais dans un commentaire de code.
- Les dates sont absolues.
