# Documentation

Tout ce qu'un agent doit lire avant de toucher au code, et tout ce que le propriétaire du projet doit tenir à jour. Les documents sont la spécification ; le code les suit.

## Carte

| Document | Ce qu'il contient | Qui le lit |
| --- | --- | --- |
| [`product/PRODUCT.md`](./product/PRODUCT.md) | Le produit, les cibles, l'offre gratuite et la licence, la voix | tout le monde |
| [`product/DESIGN.md`](./product/DESIGN.md) | Le système de design monochrome : tokens, règles, mise en œuvre | site, web, desktop |
| [`architecture.md`](./architecture.md) | Les composants, les runtimes, les frontières, les règles qui ne bougent pas | tout le monde |
| [`monorepo.md`](./monorepo.md) | Outillage : Bun, Turbo, Biome, hooks, CI, Cloudflare Builds, secrets | tout le monde |
| [`deploy.md`](./deploy.md) | La mise en ligne, étape par étape : Cloudflare, D1, R2, Stripe, GitHub Actions | le propriétaire |
| [`runbook.md`](./runbook.md) | Un incident de production : onboarding qui meurt, « Licence requise », release en échec, mail perdu, ban fail2ban, mot de passe sudo ou appareils perdus | le propriétaire |
| [`desktop.md`](./desktop.md) | L'app desktop de l'intérieur : canaux vers l'agent, SSH et clés, compte, mises à jour, transferts, arborescence | desktop |
| [`security.md`](./security.md) | Modèle de menace sans secret du code, licence, jetons | web, desktop, agent |
| [`legal.md`](./legal.md) | L'éditeur, la licence du code, les pages légales publiées, ce qui reste à remplir | tout le monde |
| [`contracts/agent-protocol.md`](./contracts/agent-protocol.md) | Le protocole JSON entre l'app et l'agent, sur SSH | desktop, agent |
| [`contracts/platform-api.md`](./contracts/platform-api.md) | L'API `/api/v1` consommée par la console, l'app et l'agent | web, desktop, agent |
| [`contracts/service-catalog.md`](./contracts/service-catalog.md) | Les modules du catalogue, leurs manifestes, leurs champs | desktop, agent |
| [`contracts/config-migrations.md`](./contracts/config-migrations.md) | Comment une configuration passe d'une version à la suivante, sur le VPS et sur le laptop | desktop, agent |
| [`contracts/backups.md`](./contracts/backups.md) | Les sauvegardes chiffrées vers le seau S3 du client : parties, manifeste, restauration, commandes `backup.*` | desktop, agent, web |
| [`contracts/platform-mail.md`](./contracts/platform-mail.md) | La boîte de la plateforme : Email Routing, boîtes, fils, envoi, pièces jointes, temps réel | web |
| [`decisions/`](./decisions/) | Une décision par fichier, jusqu'à la 0018 (code source disponible, gratuit jusqu'à trois serveurs). Un agent qui veut « améliorer » une décision la lit d'abord | tout le monde |
| [`tasks/`](./tasks/) | Ce qui est décidé mais attend un compte, une validation ou une échéance extérieure. Un fichier par tâche, supprimé le jour où elle est faite | tout le monde |

## Conventions d'écriture

- Français, présent, phrases courtes. Un document dit ce qui est vrai, pas ce qui a été envisagé.
- Un document qui contredit un autre est un bug : corriger les deux dans la même passe.
- Les décisions vont dans `decisions/`, jamais dans un commentaire de code.
- Les dates sont absolues.
