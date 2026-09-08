# Légal

Ce que le dépôt dit de l'éditeur, où il le dit, et ce qui reste à remplir. Une seule source : [`packages/shared/src/legal/index.ts`](../packages/shared/src/legal/index.ts). Le site, la console et l'app desktop la lisent ; aucun d'eux ne réécrit un nom, une adresse ni une adresse email de contact.

## L'état actuel

Le projet est en développement. La société qui éditera Pupitre n'existe pas encore : le dépôt ne revendique donc aucune raison sociale, aucune forme juridique, aucun siège et aucun numéro. Le plan d'immatriculation vit hors dépôt, dans [`incorporation.pdf`](./incorporation.pdf).

Conséquences, tenues par le code :

- `PROJECT_STAGE` vaut `development`. C'est le seul interrupteur : il passe à `public` le jour où la société est immatriculée et où les documents sont relus.
- `LEGAL_ENTITY.status` vaut `in-formation` et tous ses champs d'identité valent `null`. `legalEntityLabel()` rend « Pupitre — société en cours de constitution », jamais un nom inventé.
- Les dix pages légales du site sont des brouillons. Chacune ouvre sur un avertissement : projet en développement, service fermé, document sans valeur contractuelle, identité légale à venir.
- Le pied de page du site et celui de la console portent le même avertissement, en une ligne.
- L'éditeur sera une société américaine et la plateforme sera hébergée aux États-Unis. La base de données vit encore en région européenne : la migration vers les États-Unis se fait avant l'ouverture. Les pages légales le disent au lieu de promettre un hébergement européen.

## Ce que la source partagée contient

| Export | Ce qu'il porte |
| --- | --- |
| `PROJECT_STAGE`, `isPublicStage()` | l'étape du projet : `development` ou `public` |
| `LEGAL_ENTITY`, `isIncorporated()`, `legalEntityLabel()` | l'éditeur, ses champs vides, et le nom à afficher tant qu'il n'existe pas |
| `LEGAL_CONTACTS` | `support`, `legal`, `privacy`, `security` |
| `PUPITRE_ORIGINS` | les deux origines : le site et la plateforme |
| `LEGAL_DOCUMENTS` | les cinq documents, leur ordre, leur date, leur état |
| `SUB_PROCESSORS` | les sous-traitants, leur rôle et leur région, en fr et en en |
| `developmentNotice()` | l'avertissement de développement dans les deux langues |

Les pages légales du site rendent les sous-traitants par `<SubProcessors />`, jamais par un tableau écrit à la main : la liste change à un seul endroit.

## Le garde de publication

`apps/site/scripts/legal.ts` s'exécute au démarrage du build Astro et lit l'étape du projet :

- un `TODO` dans une page légale fait échouer le build de production, à toute étape ;
- tant que l'étape vaut `development`, un brouillon et un passage entre crochets se publient, avec un avertissement de build ;
- dès que l'étape vaut `public`, un brouillon ou un crochet à compléter fait échouer le build de production ;
- passer l'étape à `public` alors que l'éditeur n'est pas immatriculé fait échouer le build.

Un build de production, c'est `CF_PAGES_BRANCH=main` ou `PUPITRE_ENV=production`.

## À faire à l'immatriculation

1. Remplir `LEGAL_ENTITY` : raison sociale, forme, siège, numéro d'immatriculation, numéro fiscal, TVA le cas échéant, droit applicable, tribunaux, directeur de la publication. Passer `status` à `incorporated`.
2. Remplacer, dans les dix pages légales, chaque passage entre crochets par l'information réelle : identité, remboursements, disponibilité, plafond de responsabilité, durées de conservation légales, autorité de contrôle, clauses de transfert, modalités d'audit.
3. Faire relire les cinq documents par un avocat, dans les deux langues, puis passer `status` à `published` dans `LEGAL_DOCUMENTS` et `draft: false` dans les frontmatters.
4. Compléter les coordonnées et le pays d'établissement de chaque sous-traitant, et publier le DPA téléchargeable.
5. Vérifier que la migration de la base est faite : les régions annoncées dans `SUB_PROCESSORS` et dans les pages légales sont les régions réelles, et la phrase de migration disparaît.
6. Créer les boîtes `legal@`, `privacy@` et `security@` si elles n'existent pas encore.
7. Passer `PROJECT_STAGE` à `public`. Le build de production dira ce qui manque encore.

Rien de tout cela ne se fait au fil de l'eau : c'est une passe dédiée, avec la relecture d'un avocat.
